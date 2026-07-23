"""API contract tests for /api/v1/."""

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from core.models import Anime, Category, Season, ShareLink

pytestmark = pytest.mark.django_db


@pytest.fixture
def user():
    return User.objects.create_user("alice", "alice@example.com", "pw")


@pytest.fixture
def other_user():
    return User.objects.create_user("bob", "bob@example.com", "pw")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def anon_client():
    return APIClient()


def make_category(user, name="Watching", order=0, ucid=1):
    return Category.objects.create(
        user=user, name=name, order=order, user_category_id=ucid
    )


def make_anime(category, name, order=0, **kwargs):
    return Anime.objects.create(category=category, name=name, order=order, **kwargs)


# ─── /me ────────────────────────────────────────────────────────────────


def test_me(client, user):
    resp = client.get("/api/v1/me/")
    assert resp.status_code == 200
    assert resp.json() == {
        "username": "alice",
        "name": "alice",
        "email": "alice@example.com",
        "avatar_url": "",
        "email_verified": False,
    }


def test_me_requires_auth(anon_client):
    assert anon_client.get("/api/v1/me/").status_code == 401


# ─── Categories ─────────────────────────────────────────────────────────


def test_category_create_assigns_sequential_ids(client):
    r1 = client.post("/api/v1/categories/", {"name": "Watching"})
    r2 = client.post("/api/v1/categories/", {"name": "Completed"})
    assert r1.status_code == 201 and r2.status_code == 201
    assert (r1.json()["id"], r1.json()["order"]) == (1, 0)
    assert (r2.json()["id"], r2.json()["order"]) == (2, 1)


def test_category_delete_reindexes_orders(client, user):
    for i, name in enumerate(["a", "b", "c"]):
        make_category(user, name=name, order=i, ucid=i + 1)
    assert client.delete("/api/v1/categories/2/").status_code == 204
    remaining = list(
        Category.objects.filter(user=user).order_by("order").values_list(
            "name", "order"
        )
    )
    assert remaining == [("a", 0), ("c", 1)]


def test_category_reorder(client, user):
    for i in (1, 2, 3):
        make_category(user, name=f"c{i}", order=i - 1, ucid=i)
    resp = client.patch("/api/v1/categories/order/", {"order": [3, 1, 2]}, format="json")
    assert resp.status_code == 200
    got = list(
        Category.objects.filter(user=user).order_by("order").values_list(
            "user_category_id", flat=True
        )
    )
    assert got == [3, 1, 2]


# ─── Animes ─────────────────────────────────────────────────────────────


def test_anime_list_scoped_to_category(client, user):
    cat = make_category(user)
    make_anime(cat, "Naruto")
    other_cat = make_category(user, name="Other", ucid=2)
    make_anime(other_cat, "Bleach")
    resp = client.get("/api/v1/categories/1/animes/")
    assert resp.status_code == 200
    assert [a["name"] for a in resp.json()] == ["Naruto"]


def test_anime_update_and_delete(client, user):
    cat = make_category(user)
    anime = make_anime(cat, "Naruto")
    make_anime(cat, "Bleach", order=1)

    resp = client.patch(
        f"/api/v1/categories/1/animes/{anime.id}/", {"stars": 8.5}, format="json"
    )
    assert resp.status_code == 200
    assert resp.json()["stars"] == 8.5

    assert (
        client.delete(f"/api/v1/categories/1/animes/{anime.id}/").status_code == 204
    )
    # remaining anime re-indexed to order 0
    assert list(cat.animes.values_list("name", "order")) == [("Bleach", 0)]


def test_anime_reorder(client, user):
    cat = make_category(user)
    ids = [make_anime(cat, f"a{i}", order=i).id for i in range(3)]
    resp = client.patch(
        "/api/v1/categories/1/animes/order/",
        {"order": [ids[2], ids[0], ids[1]]},
        format="json",
    )
    assert resp.status_code == 200
    got = list(cat.animes.order_by("order").values_list("id", flat=True))
    assert got == [ids[2], ids[0], ids[1]]


# ─── Search ─────────────────────────────────────────────────────────────


def test_search_q_filters_and_limits(client, user):
    cat = make_category(user)
    for i in range(20):
        make_anime(cat, f"Naruto {i}", order=i)
    make_anime(cat, "Bleach", order=20)

    resp = client.get("/api/v1/animes/search/", {"q": "naruto"})
    assert resp.status_code == 200
    assert len(resp.json()) == 15  # icontains match, capped

    assert len(client.get("/api/v1/animes/search/", {"q": "bleach"}).json()) == 1
    assert client.get("/api/v1/animes/search/", {"q": "zzz"}).json() == []
    # legacy no-q path returns everything
    assert len(client.get("/api/v1/animes/search/").json()) == 21


def test_search_scoped_to_user(client, other_user):
    other_cat = make_category(other_user)
    make_anime(other_cat, "Secret Show")
    assert client.get("/api/v1/animes/search/", {"q": "secret"}).json() == []


def test_search_includes_seasons_and_category(client, user):
    cat = make_category(user)
    anime = make_anime(cat, "Naruto")
    Season.objects.create(anime=anime, number=1, total_episodes=12, watched_episodes=12)
    row = client.get("/api/v1/animes/search/", {"q": "naruto"}).json()[0]
    assert row["category_id"] == 1
    assert row["category_name"] == "Watching"
    assert row["seasons"][0]["is_completed"] is True


# ─── bulk_sync ──────────────────────────────────────────────────────────


def test_bulk_sync_create_then_update_via_temp_id(client, user):
    make_category(user)
    resp = client.post(
        "/api/v1/animes/bulk_sync/",
        {
            "actions": [
                {
                    "type": "CREATE",
                    "temp_id": "t1",
                    "data": {"category_id": 1, "name": "Naruto"},
                },
                {"type": "UPDATE", "temp_id": "t1", "data": {"stars": 9}},
            ]
        },
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["errors"] == []
    anime = Anime.objects.get(id=body["created_ids"]["t1"])
    assert anime.name == "Naruto" and anime.stars == 9


def test_bulk_sync_reports_per_action_errors(client, user):
    make_category(user)
    resp = client.post(
        "/api/v1/animes/bulk_sync/",
        {
            "actions": [
                {"type": "CREATE", "data": {"category_id": 99, "name": "X"}},
                {"type": "CREATE", "data": {"name": "no category"}},
                {"type": "UPDATE", "data": {"stars": 1}},
                {"type": "CREATE", "data": {"category_id": 1, "name": ""}},
                {"type": "NOPE"},
                {"type": "CREATE", "data": {"category_id": 1, "name": "Valid"}},
            ]
        },
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "partial"
    assert [e["index"] for e in body["errors"]] == [0, 1, 2, 3, 4]
    # the valid action still applied
    assert Anime.objects.filter(name="Valid").exists()


def test_bulk_sync_delete_missing_anime_is_silent(client, user):
    make_category(user)
    resp = client.post(
        "/api/v1/animes/bulk_sync/",
        {"actions": [{"type": "DELETE", "id": 12345}]},
        format="json",
    )
    assert resp.json() == {"status": "ok", "created_ids": {}, "errors": []}


def test_bulk_sync_cannot_touch_other_users_anime(client, other_user):
    other_cat = make_category(other_user)
    target = make_anime(other_cat, "Theirs")
    resp = client.post(
        "/api/v1/animes/bulk_sync/",
        {"actions": [{"type": "UPDATE", "id": target.id, "data": {"stars": 1}}]},
        format="json",
    )
    assert resp.json()["status"] == "partial"
    target.refresh_from_db()
    assert target.stars is None


# ─── Share ──────────────────────────────────────────────────────────────


def test_share_enable_data_etag_disable(client, user, anon_client):
    cat = make_category(user)
    make_anime(cat, "Naruto")

    resp = client.post("/api/v1/share/")
    assert resp.status_code == 201
    token = resp.json()["token"]

    data_url = f"/api/v1/share/data/{token}/"
    first = anon_client.get(data_url)
    assert first.status_code == 200
    assert first.json()[0]["animes"][0]["name"] == "Naruto"
    assert first["Cache-Control"] == "public, max-age=60"
    etag = first["ETag"]

    assert anon_client.get(data_url, HTTP_IF_NONE_MATCH=etag).status_code == 304

    assert client.delete("/api/v1/share/").status_code == 200
    assert anon_client.get(data_url).status_code == 404


def test_share_copy(client, user, other_user):
    src_cat = make_category(other_user)
    src_anime = make_anime(src_cat, "Naruto", stars=8)
    Season.objects.create(anime=src_anime, number=1, total_episodes=12, watched_episodes=5)
    link = ShareLink.objects.create(user=other_user, token="abc12345678")

    resp = client.post(f"/api/v1/share/copy/{link.token}/")
    assert resp.status_code == 200

    copied = Anime.objects.get(category__user=user, name="Naruto")
    assert copied.stars == 8
    assert copied.seasons.count() == 1
    assert copied.category.name == "Watching"

    # idempotent: copying again creates no duplicates
    client.post(f"/api/v1/share/copy/{link.token}/")
    assert Anime.objects.filter(category__user=user, name="Naruto").count() == 1


def test_share_copy_own_list_rejected(client, user):
    link = ShareLink.objects.create(user=user, token="own12345678")
    assert client.post(f"/api/v1/share/copy/{link.token}/").status_code == 400
