import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from "react-router-dom";
import { ExplorePage } from "./pages/ExplorePage";
import { PracticePage } from "./pages/PracticePage";
import { generateBoardId } from "./bridge";

function RedirectToNewBoard() {
  const { id } = generateBoardId();
  return <Navigate to={`/bid/${id}`} replace />;
}

/** Wrapper that forces PracticePage to remount when boardId changes. */
function PracticeRoute() {
  const { boardId } = useParams<{ boardId: string }>();
  return <PracticePage key={boardId} />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<RedirectToNewBoard />} />
        <Route path="/bid/:boardId" element={<PracticeRoute />} />
        <Route path="/explore" element={<ExplorePage />} />
      </Routes>
    </BrowserRouter>
  );
}
