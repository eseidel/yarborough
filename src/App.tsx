import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { useState } from "react";
import { ExplorePage } from "./pages/ExplorePage";
import { PracticePage } from "./pages/PracticePage";
import { ProgressPage } from "./pages/ProgressPage";
import { generateBoardId } from "./bridge";

/**
 * A board to bid: the one in the URL, or at the root URL a fresh one.
 *
 * The root URL renders a board directly rather than redirecting to
 * /bid/<board>. It is the site's most-linked URL, and a redirect to a
 * freshly generated permalink would leave "/" itself with nothing indexable
 * on it. Navigating to /bid/<board> happens on the first interaction, so the
 * permalink still appears in the address bar.
 *
 * Both routes render this same component, so that moving from "/" to the
 * fresh board's permalink keeps the page as it is rather than building it
 * again, calls and all. The page remounts when the board changes, and
 * coming back to "/" from a permalink (the Practice tab) deals a fresh one.
 */
function PracticeRoute() {
  const { boardId } = useParams<{ boardId: string }>();
  const [fresh, setFresh] = useState(() => generateBoardId().id);
  const [prevBoardId, setPrevBoardId] = useState(boardId);
  let freshId = fresh;
  if (boardId !== prevBoardId) {
    setPrevBoardId(boardId);
    if (!boardId) {
      freshId = generateBoardId().id;
      setFresh(freshId);
    }
  }
  const baseBoardId = boardId?.split(":")[0] ?? freshId;
  return (
    <PracticePage key={baseBoardId} boardId={boardId ? undefined : freshId} />
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<PracticeRoute />} />
        <Route path="/bid/:boardId" element={<PracticeRoute />} />
        <Route path="/explore/:exploreId" element={<ExplorePage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/progress" element={<ProgressPage />} />
      </Routes>
    </BrowserRouter>
  );
}
