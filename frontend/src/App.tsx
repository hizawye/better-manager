import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Proxy from './pages/Proxy';
import Providers from './pages/Providers';
import Monitor from './pages/Monitor';
import Settings from './pages/Settings';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'accounts',
        element: <Accounts />,
      },
      {
        path: 'proxy',
        element: <Proxy />,
      },
      {
        path: 'providers',
        element: <Providers />,
      },
      {
        path: 'monitor',
        element: <Monitor />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
