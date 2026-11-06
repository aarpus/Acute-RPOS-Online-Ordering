import type { HomeData } from '../data/home';

type Props = {
  categories: HomeData['categories'];
  selected: string;
  onSelect: (id: string) => void;
};

export default function CategoryNav({ categories, selected, onSelect }: Props) {
  return (
    <nav aria-label="Food categories" className="flex justify-start gap-3 overflow-x-auto pb-4 lg:justify-center lg:gap-4">
      {categories.map((category) => (
        <button
          type="button"
          key={category.id}
          onClick={() => onSelect(category.id)}
          aria-pressed={selected === category.id}
          aria-controls="menu"
          className={`flex w-[76px] shrink-0 flex-col items-center gap-2 border-b-2 pb-2 text-center lg:w-20 ${selected === category.id ? 'border-red-700 font-semibold text-red-700' : 'border-transparent'}`}
        >
          <img src={category.image} alt="" className="size-16 rounded-full border border-gray-200 object-cover lg:size-20" />
          <span className="min-h-10 text-sm leading-5">{category.name}</span>
        </button>
      ))}
    </nav>
  );
}
