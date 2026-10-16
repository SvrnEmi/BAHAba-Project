import { RouterProvider } from 'react-router';
import { router } from './routes.tsx';
import { AuthProvider } from '../lib/auth';

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
