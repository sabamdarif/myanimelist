"use client";

import "../styles/category_tabs.css";
import "../styles/anime_table.css";
import "../styles/search.css";
import "../styles/fab.css";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiJson } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { type Anime, type Category, normalizeAnime } from "@/lib/anime";
import {
  EMPTY_FILTERS,
  type Filters,
  applyFilters,
  hasActiveFilters,
  loadFilters,
  saveFilters,
  toggleFilter,
} from "@/lib/filters";
import { useAnimeReorder, useCategoryReorder } from "@/lib/reorder";
import {
  SEARCH_NAV_EVENT,
  consumeAnimeNavigation,
} from "@/lib/search";
import { useIsMobile } from "@/lib/useIsMobile";
import { useAnimeWrites } from "@/lib/animeWrites";
import { toast } from "@/lib/toast";
import { AnimeModal, type AnimeModalState } from "@/components/list/AnimeModal";
import { AnimeTable } from "@/components/list/AnimeTable";
import { AutofetchBanner } from "@/components/list/AutofetchBanner";
import {
  CategoryModal,
  type CategoryModalState,
} from "@/components/list/CategoryModal";
import { CategoryTabs } from "@/components/list/CategoryTabs";
import { FilterPills, FilterToolbar } from "@/components/list/FilterToolbar";
import { MobileCards } from "@/components/list/MobileCards";
import { MobileSearchPanel } from "@/components/list/MobileSearchPanel";
import { useCommentPopups } from "@/components/list/seasons";

async function fetchCategories(): Promise<Category[]> {
  const data = await apiJson<unknown>("/api/v1/categories/");
  return Array.isArray(data)
    ? data
    : ((data as { results?: Category[] }).results ?? []);
}

async function fetchAnimes(categoryId: number): Promise<Anime[]> {
  const data = await apiJson<unknown>(
    `/api/v1/categories/${categoryId}/animes/`,
  );
  const list = Array.isArray(data)
    ? data
    : ((data as { results?: unknown[] }).results ?? []);
  return (list as Record<string, unknown>[]).map(normalizeAnime);
}

export default function ListPage() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  useCommentPopups();

  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [fabOpen, setFabOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [stickyEl, setStickyEl] = useState<Element | null>(null);
  const [animeModal, setAnimeModal] = useState<AnimeModalState | null>(null);
  const [categoryModal, setCategoryModal] = useState<CategoryModalState | null>(
    null,
  );
  const fabRef = useRef<HTMLDivElement>(null);
  const activeCatRef = useRef<number | null>(null);
  activeCatRef.current = activeCat;

  const { createAnime, updateAnime, deleteAnime } = useAnimeWrites();

  const catQ = useQuery({
    queryKey: queryKeys.categories,
    queryFn: fetchCategories,
  });

  const animeQ = useQuery({
    queryKey: queryKeys.animes(activeCat ?? -1),
    queryFn: () => fetchAnimes(activeCat as number),
    enabled: activeCat != null,
  });

  // tabs render inside the sticky header (portal — Header lives in the root layout)
  useEffect(() => {
    setStickyEl(document.querySelector(".sticky_header"));
  }, []);

  // filter cookie is client-only
  useEffect(() => {
    setFilters(loadFilters());
  }, []);

  // pick start tab: localStorage or first
  useEffect(() => {
    if (activeCat != null || !catQ.data?.length) return;
    let start = catQ.data[0];
    try {
      const saved = localStorage.getItem("active_category");
      const found = saved
        ? catQ.data.find((c) => String(c.id) === saved)
        : null;
      if (found) start = found;
    } catch {}
    setActiveCat(start.id);
  }, [catQ.data, activeCat]);

  // scroll persistence per tab (same sessionStorage keys as the old app)
  useEffect(() => {
    const onHide = () => {
      const cat = activeCatRef.current;
      if (cat != null) {
        try {
          sessionStorage.setItem("ar_scroll_" + cat, String(window.scrollY));
        } catch {}
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  useEffect(() => {
    if (activeCat == null || !animeQ.data) return;
    try {
      const saved = sessionStorage.getItem("ar_scroll_" + activeCat);
      if (saved) {
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(saved, 10));
          sessionStorage.removeItem("ar_scroll_" + activeCat);
        });
      }
    } catch {}
  }, [activeCat, animeQ.data]);

  const selectCat = useCallback((id: number) => {
    try {
      localStorage.setItem("active_category", String(id));
      sessionStorage.removeItem("ar_scroll_" + id);
    } catch {}
    setActiveCat(id);
  }, []);

  // search result navigation: switch tab, then scroll + highlight once rows render
  const [pendingNav, setPendingNav] = useState<{
    cat: number;
    anime: number | string;
  } | null>(null);

  useEffect(() => {
    const consume = () => {
      const nav = consumeAnimeNavigation();
      if (!nav) return;
      selectCat(nav.categoryId);
      setPendingNav({ cat: nav.categoryId, anime: nav.animeId });
    };
    consume(); // picked on another route before landing here
    window.addEventListener(SEARCH_NAV_EVENT, consume);
    return () => window.removeEventListener(SEARCH_NAV_EVENT, consume);
  }, [selectCat]);

  useEffect(() => {
    if (!pendingNav || activeCat !== pendingNav.cat || !animeQ.data) return;
    const id = pendingNav.anime;
    setPendingNav(null);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `tr[data-anime-id="${id}"], .m_card[data-anime-id="${id}"]`,
      );
      if (!el) return; // filtered out or gone
      const header = document.querySelector<HTMLElement>(".sticky_header");
      const top =
        window.scrollY +
        el.getBoundingClientRect().top -
        (header?.offsetHeight ?? 0) -
        20;
      window.scrollTo({ top, behavior: "smooth" });
      el.classList.remove("search_highlight");
      void el.offsetWidth; // restart the 1.8s pulse if re-selected
      el.classList.add("search_highlight");
      setTimeout(() => el.classList.remove("search_highlight"), 1800);
    });
  }, [pendingNav, activeCat, animeQ.data]);

  // header mobile-search button
  useEffect(() => {
    const onOpen = () => setSearchOpen(true);
    window.addEventListener("anilist:open-mobile-search", onOpen);
    return () =>
      window.removeEventListener("anilist:open-mobile-search", onOpen);
  }, []);

  // header add-anime / add-category buttons (dispatched from the sticky Header)
  const hasCategories = !!catQ.data?.length;
  useEffect(() => {
    const onAddCategory = () => setCategoryModal({ mode: "add" });
    const onAddAnime = () => {
      if (!hasCategories) {
        toast("Please create a category first");
        return;
      }
      setAnimeModal({ mode: "add" });
    };
    window.addEventListener("anilist:add-category", onAddCategory);
    window.addEventListener("anilist:add-anime", onAddAnime);
    return () => {
      window.removeEventListener("anilist:add-category", onAddCategory);
      window.removeEventListener("anilist:add-anime", onAddAnime);
    };
  }, [hasCategories]);

  const openEditAnime = useCallback(
    (a: Anime) => {
      if (activeCat != null) setAnimeModal({ mode: "edit", anime: a, categoryId: activeCat });
    },
    [activeCat],
  );

  // FAB outside-click close
  useEffect(() => {
    if (!fabOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!fabRef.current?.contains(e.target as Node)) setFabOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [fabOpen]);

  const prefetchCat = (id: number) =>
    queryClient.prefetchQuery({
      queryKey: queryKeys.animes(id),
      queryFn: () => fetchAnimes(id),
      staleTime: 60_000,
    });

  const animeReorder = useAnimeReorder(activeCat);
  const catReorder = useCategoryReorder();
  // filtered/sorted view ≠ server order — reorder only meaningful unfiltered
  const reorderDisabled = hasActiveFilters(filters);

  const changeFilters = (next: Filters) => {
    setFilters(next);
    saveFilters(next);
  };
  const onFilterToggle = (type: string, val: string) =>
    changeFilters(toggleFilter(filters, type, val));
  const onFilterClear = () => changeFilters(EMPTY_FILTERS);

  const onThumbLoaded = useCallback(
    (animeId: number | string, thumbUrl: string) => {
      const cat = activeCatRef.current;
      if (cat == null) return;
      queryClient.setQueryData<Anime[]>(queryKeys.animes(cat), (old) =>
        old?.map((a) =>
          String(a.id) === String(animeId)
            ? { ...a, thumbnail_url: thumbUrl }
            : a,
        ),
      );
    },
    [queryClient],
  );

  let listState: Anime[] | "loading" | "error";
  let emptyMessage = "No anime found in this category.";
  if (catQ.isError) {
    listState = [];
    emptyMessage = "";
  } else if (catQ.data && catQ.data.length === 0) {
    listState = [];
    emptyMessage = "Please create a category first to add anime.";
  } else if (animeQ.isError) {
    listState = "error";
  } else if (animeQ.data) {
    listState = applyFilters(animeQ.data, filters);
  } else {
    listState = "loading";
  }

  const tabsState = catQ.isPending
    ? ("loading" as const)
    : catQ.isError
      ? ("error" as const)
      : catQ.data;

  return (
    <>
      {stickyEl &&
        createPortal(
          <CategoryTabs
            categories={tabsState}
            activeId={activeCat}
            onSelect={selectCat}
            onHover={prefetchCat}
            onReorder={catReorder.mutate}
            onEditCategory={(cat) =>
              setCategoryModal({ mode: "edit", id: cat.id, name: cat.name })
            }
          />,
          stickyEl,
        )}
      <main className="anime_table_wrapper">
        {activeCat != null && animeQ.data && (
          <AutofetchBanner
            key={activeCat}
            missing={animeQ.data.filter((a) => !a.thumbnail_url)}
            categoryId={activeCat}
            onThumb={onThumbLoaded}
          />
        )}
        {isMobile ? (
          <MobileCards
            animes={listState}
            categoryId={activeCat}
            emptyMessage={emptyMessage}
            onThumbLoaded={onThumbLoaded}
            onReorder={animeReorder.mutate}
            dragDisabled={reorderDisabled}
            onEdit={openEditAnime}
          />
        ) : (
          <AnimeTable
            animes={listState}
            categoryId={activeCat}
            emptyMessage={emptyMessage}
            onThumbLoaded={onThumbLoaded}
            onReorder={animeReorder.mutate}
            dragDisabled={reorderDisabled}
            onEdit={openEditAnime}
            filterSlot={
              <FilterToolbar
                filters={filters}
                onToggle={onFilterToggle}
                onClear={onFilterClear}
              />
            }
          />
        )}
        <div
          className={`m_fab_container${fabOpen ? " m_fab_open" : ""}`}
          id="m_fab_container"
          ref={fabRef}
        >
          <button
            type="button"
            className="m_fab_option"
            id="m_fab_add_category"
            aria-label="Add Category"
            onClick={() => {
              setFabOpen(false);
              setCategoryModal({ mode: "add" });
            }}
          >
            <i className="nf nf-oct-plus"></i> Category
          </button>
          <button
            type="button"
            className={`m_fab_option${!hasCategories ? " m_fab_option_disabled" : ""}`}
            id="m_fab_add_anime"
            aria-label="Add Anime"
            onClick={() => {
              setFabOpen(false);
              if (!hasCategories) {
                toast("Please create a category first");
                return;
              }
              setAnimeModal({ mode: "add" });
            }}
          >
            <i className="nf nf-oct-plus"></i> Add Anime
          </button>
          <button
            type="button"
            className="m_fab_main"
            id="m_fab_main_btn"
            aria-label="Actions"
            onClick={(e) => {
              e.stopPropagation();
              setFabOpen((o) => !o);
            }}
          >
            <i className="nf nf-oct-plus"></i>
          </button>
        </div>
      </main>
      <MobileSearchPanel open={searchOpen} onClose={() => setSearchOpen(false)}>
        {isMobile && (
          <FilterPills
            filters={filters}
            onToggle={onFilterToggle}
            onClear={onFilterClear}
          />
        )}
      </MobileSearchPanel>
      <AnimeModal
        state={animeModal}
        categories={catQ.data ?? []}
        activeCatId={activeCat}
        onClose={() => setAnimeModal(null)}
        onCreate={createAnime}
        onUpdate={updateAnime}
        onDelete={deleteAnime}
      />
      <CategoryModal
        state={categoryModal}
        onClose={() => setCategoryModal(null)}
      />
    </>
  );
}
