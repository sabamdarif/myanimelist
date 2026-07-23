import hashlib
import json
import secrets

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import Anime, Category, Season, ShareLink

from .serializers import AnimeSerializer, CategorySerializer, SearchAnimeSerializer

SEARCH_RESULT_LIMIT = 15


def _next_anime_order(category):
    """Next free order slot in a category.

    Locks the category's anime rows (select_for_update — no-op on SQLite,
    real lock on Postgres) so concurrent inserts can't grab the same slot.
    Caller must be inside a transaction.
    """
    orders = Anime.objects.select_for_update().filter(category=category).values_list(
        "order", flat=True
    )
    return max(orders, default=-1) + 1


def _next_category_slots(user):
    """Next free (order, user_category_id) for a user's new category.

    Same locking rules as _next_anime_order. The (user, user_category_id)
    unique constraint backstops the empty-table phantom race.
    """
    rows = Category.objects.select_for_update().filter(user=user).values_list(
        "order", "user_category_id"
    )
    rows = list(rows)
    next_order = max((o for o, _ in rows), default=-1) + 1
    next_ucid = max((u for _, u in rows), default=0) + 1
    return next_order, next_ucid


def _reindex_anime_order(category):
    """Re-assign order = 0, 1, 2, … for all anime in this category using bulk_update."""
    siblings = Anime.objects.filter(category=category).order_by("order", "pk")
    updates = []
    for idx, anime in enumerate(siblings):
        if anime.order != idx:
            anime.order = idx
            updates.append(anime)

    if updates:
        with transaction.atomic():
            Anime.objects.bulk_update(updates, ["order"])


def _reindex_category_order(user):
    """Re-assign order = 0, 1, 2, … for all of a user's categories using bulk_update."""
    siblings = Category.objects.filter(user=user).order_by("order", "pk")
    updates = []
    for idx, cat in enumerate(siblings):
        if cat.order != idx:
            cat.order = idx
            updates.append(cat)

    if updates:
        Category.objects.bulk_update(updates, ["order"])


class MeApiView(APIView):
    """Auth state for the app shell header."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        social = SocialAccount.objects.filter(user=user).first()
        avatar_url = (social.get_avatar_url() if social else None) or ""
        return Response(
            {
                "username": user.username,
                "name": user.get_full_name() or user.username,
                "email": user.email,
                "avatar_url": avatar_url,
                "email_verified": EmailAddress.objects.filter(
                    user=user, verified=True
                ).exists(),
            }
        )


class CategoryListCreateApiView(generics.ListCreateAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        with transaction.atomic():
            next_order, next_ucid = _next_category_slots(self.request.user)
            serializer.save(
                user=self.request.user, order=next_order, user_category_id=next_ucid
            )


class CategoryDetailApiView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "user_category_id"
    lookup_url_kwarg = "pk"

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_destroy(self, instance):
        user = instance.user
        with transaction.atomic():
            instance.delete()
            _reindex_category_order(user)


class AnimeListCreateApiView(generics.ListCreateAPIView):
    queryset = Anime.objects.prefetch_related("seasons").select_related("category")
    serializer_class = AnimeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                category__user=self.request.user,
                category__user_category_id=self.kwargs["category_id"],
            )
        )

    def perform_create(self, serializer):
        category = get_object_or_404(
            Category,
            user_category_id=self.kwargs["category_id"],
            user=self.request.user,
        )
        # Place new anime at the end of the list
        with transaction.atomic():
            serializer.save(category=category, order=_next_anime_order(category))


class AnimeDetailApiView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Anime.objects.prefetch_related("seasons").select_related("category")
    serializer_class = AnimeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                category__user=self.request.user,
                category__user_category_id=self.kwargs["category_id"],
            )
        )

    def perform_update(self, serializer):
        new_category_id = self.request.data.get("category_id")
        old_category = serializer.instance.category

        # If the category is being changed
        if new_category_id is not None and str(new_category_id) != str(
            self.kwargs["category_id"]
        ):
            new_category = get_object_or_404(
                Category,
                user_category_id=new_category_id,
                user=self.request.user,
            )
            # Add to the end of the new category
            with transaction.atomic():
                serializer.save(
                    category=new_category, order=_next_anime_order(new_category)
                )
                _reindex_anime_order(old_category)
        else:
            serializer.save()

    def perform_destroy(self, instance):
        category = instance.category
        instance.delete()
        _reindex_anime_order(category)


class AnimeReorderApiView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, category_id):
        category = get_object_or_404(
            Category, user_category_id=category_id, user=request.user
        )
        ordered_ids = request.data.get("order", [])
        if not isinstance(ordered_ids, list):
            return Response(
                {"detail": "order must be a list of anime IDs"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        anime_qs = Anime.objects.filter(category=category)
        valid_ids = set(anime_qs.values_list("id", flat=True))

        for aid in ordered_ids:
            if aid not in valid_ids:
                return Response(
                    {"detail": f"Anime {aid} not found in this category"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        animes_by_id = {a.id: a for a in anime_qs}
        updates = []
        for idx, aid in enumerate(ordered_ids):
            anime = animes_by_id.get(aid)
            if anime and anime.order != idx:
                anime.order = idx
                updates.append(anime)

        if updates:
            with transaction.atomic():
                Anime.objects.bulk_update(updates, ["order"])

        return Response({"status": "ok"})


class CategoryReorderApiView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        ordered_ids = request.data.get("order", [])
        if not isinstance(ordered_ids, list):
            return Response(
                {"detail": "order must be a list of category IDs"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get all categories belonging to the user
        cats_by_ucid = {
            cat.user_category_id: cat
            for cat in Category.objects.filter(user=request.user)
        }

        valid_ids = set(cats_by_ucid.keys())

        for cid in ordered_ids:
            if cid not in valid_ids:
                return Response(
                    {"detail": f"Category {cid} not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        updates = []
        for idx, cid in enumerate(ordered_ids):
            cat = cats_by_ucid.get(cid)
            if cat and cat.order != idx:
                cat.order = idx
                updates.append(cat)

        if updates:
            with transaction.atomic():
                Category.objects.bulk_update(updates, ["order"])

        return Response({"status": "ok"})


class SearchAnimeApiView(generics.ListAPIView):
    """Search the authenticated user's anime by name.

    With ?q= : icontains filter, max SEARCH_RESULT_LIMIT rows.
    Without ?q= : full list (legacy client-side search index — remove in phase 10).
    """

    queryset = Anime.objects.select_related("category").prefetch_related("seasons")
    serializer_class = SearchAnimeSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset().filter(category__user=self.request.user)
        q = (self.request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(name__icontains=q)[:SEARCH_RESULT_LIMIT]
        return qs


class AnimeBulkSyncApiView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        actions = request.data.get("actions", [])
        if not isinstance(actions, list):
            return Response(
                {"detail": "actions must be a list"}, status=status.HTTP_400_BAD_REQUEST
            )

        created_ids = {}
        errors = []
        categories_to_reindex = set()

        def fail(index, action_type, detail):
            errors.append({"index": index, "type": action_type, "detail": detail})

        def get_category(ucid):
            return Category.objects.get(user_category_id=ucid, user=request.user)

        for index, action in enumerate(actions):
            action_type = action.get("type")
            temp_id = action.get("temp_id")
            data = action.get("data", {})
            real_id = action.get("id")

            if action_type == "CREATE":
                category_id = data.get("category_id")
                if not category_id:
                    fail(index, action_type, "data.category_id is required")
                    continue
                try:
                    category = get_category(category_id)
                except Category.DoesNotExist:
                    fail(index, action_type, f"Category {category_id} not found")
                    continue

                serializer = AnimeSerializer(data=data)
                if not serializer.is_valid():
                    fail(index, action_type, serializer.errors)
                    continue
                anime = serializer.save(
                    category=category, order=_next_anime_order(category)
                )
                if temp_id:
                    created_ids[temp_id] = anime.id

            elif action_type == "UPDATE":
                if real_id is None and temp_id in created_ids:
                    real_id = created_ids[temp_id]

                if real_id is None:
                    fail(index, action_type, "no id or resolvable temp_id")
                    continue

                try:
                    anime = Anime.objects.get(id=real_id, category__user=request.user)
                except Anime.DoesNotExist:
                    fail(index, action_type, f"Anime {real_id} not found")
                    continue

                old_category = anime.category
                new_category_id = data.get("category_id")

                serializer = AnimeSerializer(anime, data=data, partial=True)
                if not serializer.is_valid():
                    fail(index, action_type, serializer.errors)
                    continue

                if new_category_id is not None and str(new_category_id) != str(
                    old_category.user_category_id
                ):
                    try:
                        new_category = get_category(new_category_id)
                    except Category.DoesNotExist:
                        fail(
                            index, action_type, f"Category {new_category_id} not found"
                        )
                        continue
                    serializer.save(
                        category=new_category, order=_next_anime_order(new_category)
                    )
                    categories_to_reindex.add(old_category)
                else:
                    serializer.save()

            elif action_type == "DELETE":
                if real_id is None and temp_id in created_ids:
                    real_id = created_ids[temp_id]

                if real_id is None:
                    fail(index, action_type, "no id or resolvable temp_id")
                    continue

                try:
                    anime = Anime.objects.get(id=real_id, category__user=request.user)
                    category = anime.category
                    anime.delete()
                    categories_to_reindex.add(category)
                except Anime.DoesNotExist:
                    # Anime was already deleted or doesn't exist, safely ignore
                    pass

            else:
                fail(index, action_type, f"unknown action type: {action_type!r}")

        for category in categories_to_reindex:
            _reindex_anime_order(category)

        return Response(
            {
                "status": "partial" if errors else "ok",
                "created_ids": created_ids,
                "errors": errors,
            }
        )


def _generate_share_token() -> str:
    while True:
        token = secrets.token_urlsafe(11)[:11]
        if not ShareLink.objects.filter(token=token).exists():
            return token


class ShareManageApiView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            link = request.user.share_link
            return Response(
                {
                    "enabled": True,
                    "token": link.token,
                    "url": request.build_absolute_uri(f"/share/{link.token}/"),
                }
            )
        except ShareLink.DoesNotExist:
            return Response({"enabled": False})

    def post(self, request):
        link, created = ShareLink.objects.get_or_create(
            user=request.user,
            defaults={"token": _generate_share_token()},
        )
        return Response(
            {
                "enabled": True,
                "token": link.token,
                "url": request.build_absolute_uri(f"/share/{link.token}/"),
            },
            status=status.HTTP_200_OK if not created else status.HTTP_201_CREATED,
        )

    def delete(self, request):
        ShareLink.objects.filter(user=request.user).delete()
        return Response({"enabled": False}, status=status.HTTP_200_OK)


class ShareDataApiView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "share_data"

    def get(self, request, token):
        try:
            share = ShareLink.objects.select_related("user").get(token=token)
        except ShareLink.DoesNotExist:
            return Response(
                {"detail": "This shared link does not exist or has been disabled."},
                status=status.HTTP_404_NOT_FOUND,
            )

        owner = share.user
        categories = (
            Category.objects.filter(user=owner)
            .prefetch_related("animes__seasons")
            .order_by("order")
        )

        data = [
            {
                "id": cat.user_category_id,
                "name": cat.name,
                "animes": AnimeSerializer(cat.animes.all(), many=True).data,
            }
            for cat in categories
        ]

        etag = (
            '"'
            + hashlib.md5(
                json.dumps(data, sort_keys=True, default=str).encode()
            ).hexdigest()
            + '"'
        )
        if request.headers.get("If-None-Match") == etag:
            response = Response(status=status.HTTP_304_NOT_MODIFIED)
        else:
            response = Response(data, status=status.HTTP_200_OK)
        response["ETag"] = etag
        response["Cache-Control"] = "public, max-age=60"
        response["X-Share-Owner"] = owner.get_full_name() or owner.username
        return response


class ShareCopyApiView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        try:
            share = ShareLink.objects.get(token=token)
        except ShareLink.DoesNotExist:
            return Response(
                {"detail": "This shared link does not exist or has been disabled."},
                status=status.HTTP_404_NOT_FOUND,
            )

        source_user = share.user
        target_user = request.user

        if source_user == target_user:
            return Response(
                {"detail": "Cannot copy your own list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            owner_categories = (
                Category.objects.filter(user=source_user)
                .prefetch_related("animes__seasons")
                .order_by("order")
            )

            for o_cat in owner_categories:
                # Find matching category by name for the target user
                t_cat = Category.objects.filter(
                    user=target_user, name=o_cat.name
                ).first()
                if not t_cat:
                    next_order, next_ucid = _next_category_slots(target_user)
                    t_cat = Category.objects.create(
                        user=target_user,
                        name=o_cat.name,
                        order=next_order,
                        user_category_id=next_ucid,
                    )

                # Find existing animes inside this category to avoid duplicates
                existing_anime_names = set(
                    Anime.objects.filter(category=t_cat).values_list("name", flat=True)
                )

                next_anime_order = _next_anime_order(t_cat)

                # (source, copy) pairs so seasons can be attached after bulk_create
                pairs = []
                for o_ani in o_cat.animes.all():
                    if o_ani.name in existing_anime_names:
                        continue
                    pairs.append(
                        (
                            o_ani,
                            Anime(
                                category=t_cat,
                                name=o_ani.name,
                                thumbnail_url=o_ani.thumbnail_url,
                                language=o_ani.language,
                                stars=o_ani.stars,
                                order=next_anime_order,
                            ),
                        )
                    )
                    next_anime_order += 1

                Anime.objects.bulk_create([copy for _, copy in pairs])
                seasons_to_create = [
                    Season(
                        anime=copy,
                        number=o_season.number,
                        total_episodes=o_season.total_episodes,
                        watched_episodes=o_season.watched_episodes,
                        comment=o_season.comment,
                    )
                    for o_ani, copy in pairs
                    for o_season in o_ani.seasons.all()
                ]
                if seasons_to_create:
                    Season.objects.bulk_create(seasons_to_create)

        return Response(
            {"status": "ok", "detail": "List copied successfully!"},
            status=status.HTTP_200_OK,
        )


class SessionTokenApiView(APIView):
    """
    Returns a JWT pair for the currently logged in session-authenticated user.
    """

    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = RefreshToken.for_user(request.user)
        return Response({"access": str(refresh.access_token), "refresh": str(refresh)})
