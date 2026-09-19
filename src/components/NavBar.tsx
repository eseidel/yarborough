import { Link, useLocation } from "react-router-dom";

const tabs = [
  { label: "Practice", pathPrefix: "/bid" },
  { label: "Explore", pathPrefix: "/explore" },
  { label: "Progress", pathPrefix: "/progress" },
] as const;

export function NavBar() {
  const { pathname } = useLocation();

  return (
    <nav className="bg-emerald-800 text-white px-4 py-2 flex items-center justify-center gap-2 shadow">
      {tabs.map(({ label, pathPrefix }) => {
        const active = pathname.startsWith(pathPrefix);
        return (
          <Link
            key={pathPrefix}
            to={pathPrefix === "/bid" ? "/" : pathPrefix}
            className={`px-4 py-2 rounded text-base font-medium transition-colors ${
              active
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-emerald-100 hover:bg-emerald-700 hover:text-white"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
