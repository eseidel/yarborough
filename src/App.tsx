import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ExplorePage } from "./pages/ExplorePage";
import { PracticePage } from "./pages/PracticePage";
import { generateBoardId } from "./bridge";

function RedirectToNewBoard() {
  const { id } = generateBoardId();
  return <Navigate to={`/bid/${id}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RedirectToNewBoard />} />
        <Route path="/bid/:boardId" element={<PracticePage />} />
        <Route path="/explore" element={<ExplorePage />} />
      </Routes>
    </BrowserRouter>
  );
}
