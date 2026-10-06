import { DropPage } from "./pages/DropPage";
import { UploadPage } from "./pages/UploadPage";

export default function App() {
  const match = location.pathname.match(/^\/d\/([A-Za-z0-9_-]{16})\/?$/);
  return match ? <DropPage dropId={match[1]} /> : <UploadPage />;
}
