import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { useState } from "react";
import { ExplorePage } from "./pages/ExplorePage";
import { PracticePage } from "./pages/PracticePage";
import { ProgressPage } from "./pages/ProgressPage";
import { generateBoardId } from "./bridge";

/**
 * The root URL renders a board directly rather than redirecting to
 * /bid/<board>. It is the site's most-linked URL, and a redirect to a
 * freshly generated permalink would leave "/" itself with nothing indexable
 * on it. Navigating to /bid/<board> happens on the first interaction, so the
 * permalink still appears in the address bar.
 */
function NewBoard() {
  const [id] = useState(() => generateBoardId().id);
  return <PracticePage key={id} boardId={id} />;
}

/** Wrapper that forces PracticePage to remount when boardId changes. */
function PracticeRoute() {
  const { boardId } = useParams<{ boardId: string }>();
  const baseBoardId = boardId?.split(":")[0];
  return <PracticePage key={baseBoardId} />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<NewBoard />} />
        <Route path="/bid/:boardId" element={<PracticeRoute />} />
        <Route path="/explore/:exploreId" element={<ExplorePage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/progress" element={<ProgressPage />} />
      </Routes>
    </BrowserRouter>
  );
}
