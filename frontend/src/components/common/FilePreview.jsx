import { FileText } from 'lucide-react';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];

const isImageName = (name = '') =>
  IMAGE_EXTENSIONS.includes(name.split('.').pop().toLowerCase());

const SIZES = {
  sm: 'h-16 w-16',
  md: 'h-24 w-24',
  lg: 'h-36 w-36',
};

const ICON_SIZES = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};

export default function FilePreview({ src, name = '', size = 'md', className = '' }) {
  const boxClass = `${SIZES[size]} rounded-xl border border-slate-200 shrink-0 overflow-hidden ${className}`;

  if (!isImageName(name)) {
    return (
      <div className={`${boxClass} bg-brand-50 flex items-center justify-center text-brand-500`}>
        <FileText className={ICON_SIZES[size]} />
      </div>
    );
  }

  return (
    <div className={`${boxClass} bg-slate-100`}>
      <img src={src} alt={name} className="w-full h-full object-cover" />
    </div>
  );
}
