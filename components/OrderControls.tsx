type Props = {
  mode: string;
  address: string;
  search: string;
  onModeChange: (mode: string) => void;
  onSearchChange: (search: string) => void;
};

export default function OrderControls({ mode, address, search, onModeChange, onSearchChange }: Props) {
  return (
    <section aria-label="Order preferences" className="py-5">
      <div className="flex flex-col items-center justify-center gap-3 md:flex-row">
        <div className="flex rounded-full bg-gray-100 p-1">
          {['Delivery', 'Pickup'].map((option) => (
            <button
              key={option}
              onClick={() => onModeChange(option)}
              aria-pressed={mode === option}
              className={`rounded-full px-7 py-2 ${mode === option ? 'bg-red-700 font-semibold text-white' : 'text-gray-700'}`}
            >
              {option}
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-gray-600 sm:text-sm">
          {mode === 'Delivery' ? 'Delivering to' : 'Pickup from'} {address}
        </p>
      </div>

      <input
        type="search"
        aria-label="Search dishes"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search for dishes... (e.g. biryani, paneer, wraps)"
        className="mx-auto mt-4 block w-full max-w-3xl rounded-full border border-gray-300 bg-gray-50 px-5 py-3 text-sm"
      />
    </section>
  );
}
