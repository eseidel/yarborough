import { Link } from "react-router-dom";

export function NavBar({ title }: { title: string }) {
  return (
    <nav className="bg-emerald-800 text-white px-4 py-3 flex items-center gap-4 shadow">
      <Link
        to="/"
        className="text-emerald-300 hover:text-white transition-colors"
      >
        &larr; Home
      </Link>
      <h1 className="font-semibold text-lg">{title}</h1>
    </nav>
  );
}
