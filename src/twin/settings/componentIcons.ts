import {
  Bed,
  Box,
  CircleDot,
  CircuitBoard,
  Component,
  Magnet,
  Radio,
  Ruler,
  Waves,
} from "lucide-react";

/** Icon per `inferPartRole` result, so a row reads as engineering hardware. */
const BY_TYPE: Record<string, typeof Box> = {
  "RF coil": Radio,
  Gradient: Waves,
  Shim: Ruler,
  Magnet,
  Bore: CircleDot,
  Housing: Box,
  "Patient support": Bed,
  Electronics: CircuitBoard,
};

export function iconForType(type: string): typeof Box {
  return BY_TYPE[type] ?? Component;
}
