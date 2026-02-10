import { type Call, strainSymbol, strainColor } from "../bridge";

export function CallDisplay({ call }: { call: Call }) {
  if (call.type === "pass") return <span className="text-gray-500">Pass</span>;
  if (call.type === "double")
    return <span className="font-bold text-red-600">X</span>;
  if (call.type === "redouble")
    return <span className="font-bold text-blue-600">XX</span>;
  return (
    <span>
      {call.level}
      <span className={strainColor(call.strain!)}>
        {strainSymbol(call.strain!)}
      </span>
    </span>
  );
}
