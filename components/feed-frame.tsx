import { demoPortfolio } from "@/lib/demo";

type FeedFrameProps = {
  imageUrl: string;
  headline: string;
  primaryText: string;
  placement?: "feed" | "reels";
};

/** A simple sponsored-post frame. It is not Meta's interface. */
export function FeedFrame({ imageUrl, headline, primaryText, placement = "feed" }: FeedFrameProps) {
  const tall = placement === "reels";
  return (
    <article className="w-full max-w-[22rem] overflow-hidden rounded-xl border bg-white text-[#1c1612] shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1F4A38] text-sm font-semibold text-[#F3EDE3]">
          D
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{demoPortfolio.brandName}</p>
          <p className="text-xs text-[#6d6458]">Sponsored</p>
        </div>
      </div>
      <p className="px-3 pb-2 text-sm leading-snug">{primaryText}</p>
      <div className={tall ? "aspect-[9/16]" : "aspect-[4/5]"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="flex items-center justify-between gap-3 border-t bg-[#f7f3ec] px-3 py-2.5">
        <p className="min-w-0 truncate text-sm font-semibold">{headline}</p>
        <span className="shrink-0 rounded-md bg-[#1F4A38] px-3 py-1.5 text-xs font-semibold text-[#F3EDE3]">
          Subscribe
        </span>
      </div>
    </article>
  );
}
