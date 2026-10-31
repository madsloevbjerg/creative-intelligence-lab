type CropBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Raw photo, SAM 3.1 bag mask, and the crop frame that became the ad. */
export function SamCropView({
  rawUrl,
  maskUrl,
  crop,
  imageWidth,
  imageHeight,
}: {
  rawUrl: string;
  maskUrl: string;
  crop: CropBox;
  imageWidth: number;
  imageHeight: number;
}) {
  const left = (crop.left / imageWidth) * 100;
  const top = (crop.top / imageHeight) * 100;
  const width = (crop.width / imageWidth) * 100;
  const height = (crop.height / imageHeight) * 100;
  return (
    <div className="relative overflow-hidden rounded-lg bg-[#1c1612]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={rawUrl} alt="" className="block h-auto w-full" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={maskUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full" />
      <div
        className="pointer-events-none absolute border-2 border-[#F3EDE3] shadow-[0_0_0_1px_rgba(28,22,18,0.8)]"
        style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
      />
    </div>
  );
}
