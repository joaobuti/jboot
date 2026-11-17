"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Cookies from "js-cookie";

//import Components
import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";
import RightSidebar from "@common/RightSidebar";

//import actions
import {
  changeLayout,
  changeSidebarTheme,
  changeLayoutMode,
  changeLayoutThemeColor,
  changeLayoutTheme,
  changeLayoutWidth,
  changeLayoutPosition,
  changeTopbarTheme,
  changeLeftsidebarSizeType,
  changeLeftsidebarViewType,
  changeSidebarImageType,
  changeSidebarVisibility,
} from "@slices/thunks";
import { hydrateLayoutAction } from "@slices/layouts/reducer";
import { getLayoutPreference, saveLayoutPreference } from "@/lib/identity-applications";

//redux
import { useSelector, useDispatch } from "react-redux";
import { createSelector } from "reselect";

const LAYOUT_PREFERENCE_SAVE_DEBOUNCE_MS = 800;

const Layout = ({ children }: { children: React.ReactNode }) => {
  const [headerClass, setHeaderClass] = useState("");
  const dispatch = useDispatch<any>();
  const pathname = usePathname();
  const hasHydratedPreference = useRef(false);
  const skipNextPreferenceSave = useRef(true);
  const savePreferenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectLayoutState = (state: any) => state.Layout;
  const selectLayoutProperties = createSelector(selectLayoutState, layout => ({
    layoutType: layout.layoutType,
    leftSidebarType: layout.leftSidebarType,
    layoutModeType: layout.layoutModeType,
    layoutThemeColorType: layout.layoutThemeColorType,
    layoutThemeType: layout.layoutThemeType,
    layoutWidthType: layout.layoutWidthType,
    layoutPositionType: layout.layoutPositionType,
    topbarThemeType: layout.topbarThemeType,
    leftsidbarSizeType: layout.leftsidbarSizeType,
    leftSidebarViewType: layout.leftSidebarViewType,
    leftSidebarImageType: layout.leftSidebarImageType,
    preloader: layout.preloader,
    sidebarVisibilitytype: layout.sidebarVisibilitytype,
  }));

  const {
    layoutType,
    leftSidebarType,
    layoutModeType,
    layoutThemeColorType,
    layoutThemeType,
    layoutWidthType,
    layoutPositionType,
    topbarThemeType,
    leftsidbarSizeType,
    leftSidebarViewType,
    leftSidebarImageType,
    preloader,
    sidebarVisibilitytype,
  } = useSelector(selectLayoutProperties);

  // Fetch the user's last saved layout preference once per session and merge
  // it into Redux; the apply-effect below then propagates it to the DOM.
  useEffect(() => {
    const accessToken = Cookies.get("accessToken");
    if (!accessToken) {
      hasHydratedPreference.current = true;
      skipNextPreferenceSave.current = false;
      return;
    }

    let active = true;
    void (async () => {
      try {
        const preference = await getLayoutPreference(accessToken);
        if (active && preference) {
          dispatch(hydrateLayoutAction(preference));
        } else {
          skipNextPreferenceSave.current = false;
        }
      } catch {
        skipNextPreferenceSave.current = false;
      } finally {
        if (active) {
          hasHydratedPreference.current = true;
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      layoutType ||
      leftSidebarType ||
      layoutModeType ||
      layoutThemeType ||
      layoutThemeColorType ||
      layoutWidthType ||
      layoutPositionType ||
      topbarThemeType ||
      leftsidbarSizeType ||
      leftSidebarViewType ||
      leftSidebarImageType ||
      sidebarVisibilitytype
    ) {
      window.dispatchEvent(new Event("resize"));
      dispatch(changeLeftsidebarViewType(leftSidebarViewType));
      dispatch(changeLeftsidebarSizeType(leftsidbarSizeType));
      dispatch(changeSidebarTheme(leftSidebarType));
      dispatch(changeLayoutThemeColor(layoutThemeColorType));
      dispatch(changeLayoutTheme(layoutThemeType));
      dispatch(changeLayoutMode(layoutModeType));
      dispatch(changeLayoutWidth(layoutWidthType));
      dispatch(changeLayoutPosition(layoutPositionType));
      dispatch(changeTopbarTheme(topbarThemeType));
      dispatch(changeLayout(layoutType));
      dispatch(changeSidebarImageType(leftSidebarImageType));
      dispatch(changeSidebarVisibility(sidebarVisibilitytype));
    }
  }, [
    layoutType,
    leftSidebarType,
    layoutModeType,
    layoutThemeType,
    layoutThemeColorType,
    layoutWidthType,
    layoutPositionType,
    topbarThemeType,
    leftsidbarSizeType,
    leftSidebarViewType,
    leftSidebarImageType,
    sidebarVisibilitytype,
    dispatch,
  ]);

  // Persist layout changes triggered by the user back to the server (debounced),
  // skipping the run that immediately follows a server hydration.
  useEffect(() => {
    if (!hasHydratedPreference.current) {
      return;
    }
    if (skipNextPreferenceSave.current) {
      skipNextPreferenceSave.current = false;
      return;
    }

    const accessToken = Cookies.get("accessToken");
    if (!accessToken) {
      return;
    }

    if (savePreferenceTimer.current) {
      clearTimeout(savePreferenceTimer.current);
    }
    savePreferenceTimer.current = setTimeout(() => {
      void saveLayoutPreference(accessToken, {
        layoutType,
        leftSidebarType,
        layoutModeType,
        layoutThemeColorType,
        layoutThemeType,
        layoutWidthType,
        layoutPositionType,
        topbarThemeType,
        leftsidbarSizeType,
        leftSidebarViewType,
        leftSidebarImageType,
        preloader,
        sidebarVisibilitytype,
      });
    }, LAYOUT_PREFERENCE_SAVE_DEBOUNCE_MS);

    return () => {
      if (savePreferenceTimer.current) {
        clearTimeout(savePreferenceTimer.current);
      }
    };
  }, [
    layoutType,
    leftSidebarType,
    layoutModeType,
    layoutThemeColorType,
    layoutThemeType,
    layoutWidthType,
    layoutPositionType,
    topbarThemeType,
    leftsidbarSizeType,
    leftSidebarViewType,
    leftSidebarImageType,
    preloader,
    sidebarVisibilitytype,
  ]);

  const onChangeLayoutMode = (value: any) => {
    if (changeLayoutMode) {
      dispatch(changeLayoutMode(value));
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const scrollup = document.documentElement.scrollTop;
      if (scrollup > 50) {
        setHeaderClass("topbar-shadow");
      } else {
        setHeaderClass("");
      }
    };

    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, []);

  useEffect(() => {
    const humberIcon = document.querySelector(".hamburger-icon") as HTMLElement;
    if (
      sidebarVisibilitytype === "show" ||
      layoutType === "vertical" ||
      layoutType === "twocolumn"
    ) {
      humberIcon?.classList.remove("open");
    } else {
      humberIcon?.classList.add("open");
    }
  }, [sidebarVisibilitytype, layoutType]);

  return (
    <>
      <div id="layout-wrapper">
        <Header
          headerClass={headerClass}
          leftSidebarType={leftSidebarType}
          layoutModeType={layoutModeType}
          onChangeLayoutMode={onChangeLayoutMode}
        />
        <Sidebar layoutType={layoutType} leftSidebarType={leftSidebarType} />
        <div className="main-content">
          {children}
          <Footer />
        </div>
      </div>
      <RightSidebar />
    </>
  );
};

export default Layout;
