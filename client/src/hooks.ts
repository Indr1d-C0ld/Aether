import { useEffect, useState, useSyncExternalStore } from "react";
import { net } from "./net.ts";

export function useNet() {
  return useSyncExternalStore(net.subscribe, net.getSnapshot);
}

/** Ridisegna a ~frame rate finché `active`; restituisce performance.now(). */
export function useFrame(active: boolean, fps = 20) {
  const [t, setT] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setT(performance.now()), 1000 / fps);
    return () => clearInterval(id);
  }, [active, fps]);
  return t;
}
