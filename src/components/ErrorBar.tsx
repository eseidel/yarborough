export function ErrorBar({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="bg-red-100 text-red-800 text-sm px-4 py-2 flex items-center justify-between">
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-4 font-bold hover:text-red-600"
          aria-label="Dismiss error"
        >
          &times;
        </button>
      )}
    </div>
  );
}
