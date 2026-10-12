import {
  createBrowserRouter,
  Navigate,
  RouterProvider
} from "react-router-dom";
import { ToastContainer } from "react-toastify";
import WalletsProvider from "./libs/wallets/providers";
import Layout from "./layouts";
import { lazy, useEffect, Suspense } from "react";
import { useEvmGasFees } from "./hooks/use-evm-gas-fees";
import ErrorPage from "./views/error";
import { usePrices } from "./hooks/use-prices";
import { useTradeReport } from "./hooks/use-trade-report";
import { useSolanaBroadcastReport } from "./hooks/use-solana-broadcast-report";
import ZendeskPrivider from "./components/zendesk-widget";
import { bindHistoryModeToRouter } from "./all-tokens/route-mode";

const Bridge = lazy(() => import("./views/bridge"));
const History = lazy(() => import("./views/history"));
const About = lazy(() => import("./views/about"));
const Apply = lazy(() => import("./views/apply"));
const Privacy = lazy(() => import("./views/policy/privacy"));
const TermsOfService = lazy(() => import("./views/policy/terms-of-service"));
const Developer = lazy(() => import("./views/developer"));
const DeveloperMD = lazy(() => import("./views/developer/md"));
const Ecosystem = lazy(() => import("./views/ecosystem"));

const TronEnergyModal = lazy(() => import("./views/bridge/components/tron-energy/modal"));
const TrackRoot = lazy(() => import("./components/track-root"));

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <Bridge />
      },
      {
        path: "history",
        element: <History />
      },
      {
        path: "all-tokens",
        children: [
          {
            index: true,
            element: <Bridge />
          },
          {
            path: "history",
            element: <History />
          },
        ]
      },
      {
        path: "apply",
        element: <Apply />
      },
      {
        path: "about",
        element: <About />
      },
      {
        path: "developer",
        children: [
          {
            index: true,
            element: <Developer />
          },
          {
            path: "documentation",
            element: <DeveloperMD />,
          }
        ]
      },
      {
        path: "privacy-policy",
        element: <Privacy />
      },
      {
        path: "terms-of-service",
        element: <TermsOfService />
      },
      {
        path: "ecosystem",
        element: <Ecosystem />
      },
    ]
  },
  {
    path: "*",
    element: <Navigate to="/" replace />
  }
]);

bindHistoryModeToRouter(router);

function App() {
  usePrices();
  useEvmGasFees();
  useTradeReport();
  useSolanaBroadcastReport();

  return (
    <WalletsProvider>
      <ZendeskPrivider>
        <RouterProvider router={router} />

        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={true}
          theme="light"
          toastStyle={{ backgroundColor: "transparent", boxShadow: "none" }}
          newestOnTop
          rtl={false}
          pauseOnFocusLoss
          closeButton={false}
        />

        <Suspense fallback={null}>
          <TronEnergyModal />
        </Suspense>

        <Suspense fallback={null}>
          <TrackRoot />
        </Suspense>

      </ZendeskPrivider>
    </WalletsProvider>
  );
}

export default App;
