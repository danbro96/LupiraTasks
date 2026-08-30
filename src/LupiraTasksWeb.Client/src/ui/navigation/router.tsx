import { createBrowserRouter } from 'react-router-dom';
import App from '../../App';
import { RequireAuth } from './RequireAuth';
import { ListsScreen } from '../screens/ListsScreen';
import { ListDetailScreen } from '../screens/ListDetailScreen';
import { ShareEntryScreen } from '../screens/ShareEntryScreen';

// App is the shared layout shell. `/s/:token` (account-less share links) stays PUBLIC; everything else
// sits behind RequireAuth — the landing `/` is the list of lists, `/lists/:listId` its tasks.
export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: 's/:token', element: <ShareEntryScreen /> },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <ListsScreen /> },
          { path: 'lists/:listId', element: <ListDetailScreen /> },
          { path: '*', element: <ListsScreen /> },
        ],
      },
    ],
  },
]);
