type CropBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ElementBox = {
  subject: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const ELEMENT_COLOR: Record<string, string> = {
  bag: "#1F4A38",
  person: "#2F6FED",
  face: "#2F6FED",
  phone: "#C47B2B",
  hand: "#A24B6A",
  kettle: "#5C6B73",
  roaster: "#8A5A2B",
  cup: "#C4B49A",
};

/** Raw photo, SAM 3.1 bag mask, and the crop frame that became the ad. */
export function SamCropView({
  rawUrl,
  maskUrl,
  crop,
  imageWidth,
  imageHeight,
  elements = [],
}: {
  rawUrl: string;
  maskUrl: string;
  crop: CropBox;
  imageWidth: number;
  imageHeight: number;
  elements?: ElementBox[];
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
      {elements.map((element) => {
        const color = ELEMENT_COLOR[element.subject] ?? "#F3EDE3";
        return (
          <div
            key={`${element.subject}-${element.left}-${element.top}`}
            className="pointer-events-none absolute"
            style={{
              left: `${(element.left / imageWidth) * 100}%`,
              top: `${(element.top / imageHeight) * 100}%`,
              width: `${((element.right - element.left) / imageWidth) * 100}%`,
              height: `${((element.bottom - element.top) / imageHeight) * 100}%`,
              border: `2px solid ${color}`,
              background: `${color}33`,
            }}
          >
            <span className="absolute top-0 left-0 px-1 text-[10px] font-medium text-white" style={{ background: color }}>
              {element.subject}
            </span>
          </div>
        );
      })}
    </div>
  );
}
