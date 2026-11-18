import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAdmin, RequireStaff } from './auth/AuthProvider.jsx';
import LoginPage, { ForgotPasswordPage, ResetPasswordPage } from './auth/LoginPage.jsx';
import { Loading } from './ui/Feedback.jsx';
import PublicLayout from './public/PublicLayout.jsx';
import HomePage from './public/HomePage.jsx';

const page = loader => lazy(loader);
// Público
const RoomsPage = page(() => import('./public/RoomsPage.jsx'));
const RoomDetailPage = page(() => import('./public/RoomDetailPage.jsx'));
const GalleryPage = page(() => import('./public/GalleryPage.jsx'));
const PostsPage = page(() => import('./public/PostsPage.jsx'));
const PostDetailPage = page(() => import('./public/PostDetailPage.jsx'));
const ContactPage = page(() => import('./public/ContactPage.jsx'));
const InfoPage = page(() => import('./public/InfoPage.jsx'));
const NotFoundPage = page(() => import('./public/NotFoundPage.jsx'));
// Panel
const AdminLayout = page(() => import('./admin/AdminLayout.jsx'));
const Dashboard = page(() => import('./admin/Dashboard.jsx'));
const RequestsAdmin = page(() => import('./admin/RequestsAdmin.jsx'));
const ReservationsAdmin = page(() => import('./admin/ReservationsAdmin.jsx'));
const CalendarAdmin = page(() => import('./admin/CalendarAdmin.jsx'));
const RoomsAdmin = page(() => import('./admin/RoomsAdmin.jsx'));
const RoomEditor = page(() => import('./admin/RoomEditor.jsx'));
const ContentAdmin = page(() => import('./admin/ContentAdmin.jsx'));
const PostsAdmin = page(() => import('./admin/PostsAdmin.jsx'));
const PostEditor = page(() => import('./admin/PostEditor.jsx'));
const GalleryAdmin = page(() => import('./admin/GalleryAdmin.jsx'));
const MediaAdmin = page(() => import('./admin/MediaAdmin.jsx'));
const SettingsAdmin = page(() => import('./admin/SettingsAdmin.jsx'));
const UsersAdmin = page(() => import('./admin/UsersAdmin.jsx'));
const ActivityAdmin = page(() => import('./admin/ActivityAdmin.jsx'));
const AccountPage = page(() => import('./admin/AccountPage.jsx'));

const adminOnly = el => <RequireAdmin>{el}</RequireAdmin>;

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="habitaciones" element={<RoomsPage />} />
          <Route path="habitaciones/:number" element={<RoomDetailPage />} />
          <Route path="galeria" element={<GalleryPage />} />
          <Route path="novedades" element={<PostsPage />} />
          <Route path="novedades/:slug" element={<PostDetailPage />} />
          <Route path="contacto" element={<ContactPage />} />
          <Route path="informacion" element={<InfoPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="admin/login" element={<LoginPage />} />
        <Route path="admin/recuperar" element={<ForgotPasswordPage />} />
        <Route path="admin/restablecer" element={<ResetPasswordPage />} />
        <Route path="admin" element={<RequireStaff><AdminLayout /></RequireStaff>}>
          <Route index element={<Dashboard />} />
          <Route path="solicitudes" element={adminOnly(<RequestsAdmin />)} />
          <Route path="reservas" element={adminOnly(<ReservationsAdmin />)} />
          <Route path="calendario" element={adminOnly(<CalendarAdmin />)} />
          <Route path="habitaciones" element={<RoomsAdmin />} />
          <Route path="habitaciones/:id" element={<RoomEditor />} />
          <Route path="contenido" element={<ContentAdmin />} />
          <Route path="publicaciones" element={<PostsAdmin />} />
          <Route path="publicaciones/:id" element={<PostEditor />} />
          <Route path="galeria" element={<GalleryAdmin />} />
          <Route path="medios" element={<MediaAdmin />} />
          <Route path="configuracion" element={adminOnly(<SettingsAdmin />)} />
          <Route path="usuarios" element={adminOnly(<UsersAdmin />)} />
          <Route path="actividad" element={adminOnly(<ActivityAdmin />)} />
          <Route path="cuenta" element={<AccountPage />} />
          <Route path="*" element={<NotFoundPage admin />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
