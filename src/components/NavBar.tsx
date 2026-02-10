import { Link, useLocation } from "react-router-dom";

const tabs = [
  { label: "Practice", pathPrefix: "/bid" },
  { label: "Explore", pathPrefix: "/explore" },
] as const;

export function NavBar() {
  const { pathname } = useLocation();

  return (
    <nav className="bg-emerald-800 text-white px-4 py-2 flex items-center gap-1 shadow">
      {tabs.map(({ label, pathPrefix }) => {
        const active = pathname.startsWith(pathPrefix);
        return (
          <Link
            key={pathPrefix}
            to={pathPrefix === "/bid" ? "/" : pathPrefix}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              active
                ? "bg-emerald-600 text-white"
                : "text-emerald-300 hover:text-white hover:bg-emerald-700"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
