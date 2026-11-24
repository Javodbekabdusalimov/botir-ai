import Image from "next/image";
import { bizPhoto } from "@/lib/photos";
import { cn } from "@/lib/utils";

export function BizAvatar({ id, name, size = 40, className }: { id: string; name: string; size?: number; className?: string }) {
  return (
    <Image
      src={bizPhoto(id)}
      alt={name}
      width={size}
      height={size}
      sizes={`${size}px`}
      className={cn("shrink-0 rounded-full object-cover ring-2 ring-white", className)}
      style={{ width: size, height: size }}
    />
  );
}
