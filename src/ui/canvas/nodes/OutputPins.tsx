import { Handle, Position } from "@xyflow/react";
import type { PinId } from "../../../core/registry/constants";
import { useT } from "../../services";

/** Labelled output pins stacked on the right edge of a card. */
export function OutputPins({ pins }: { pins: readonly PinId[] }) {
  const t = useT();
  return (
    <ul className="bna-pins">
      {pins.map(pin => (
        <li key={pin} className="bna-pins__row" data-pin={pin} title={t(`BNA.Pin.${pin}.Hint`)}>
          {t(`BNA.Pin.${pin}.Label`)}
          <Handle type="source" position={Position.Right} id={pin} className="bna-pin" />
        </li>
      ))}
    </ul>
  );
}
