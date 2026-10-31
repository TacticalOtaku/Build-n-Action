// Minimal declarations of the Foundry VTT 14 / dnd5e 5.3 globals this module uses. Foundry data is
// typed structurally and read through src/runtime/read.ts; there are no fvtt-types and no `any`.

export {};

declare global {
  type HookCallback = (...args: never[]) => unknown;

  interface RegionEventLike {
    readonly name: string;
    readonly data: { readonly token?: FoundryDocument; readonly movement?: { readonly id?: string } | null };
    readonly region: FoundryDocument;
  }

  interface RegionBehaviorTypeLike {
    readonly region: FoundryDocument;
  }

  type RegionBehaviorTypeClass = abstract new (...args: never[]) => RegionBehaviorTypeLike;

  interface UserLike {
    readonly id: string;
    readonly isGM: boolean;
    readonly active: boolean;
    /** The user's assigned character. */
    readonly character?: FoundryDocument | null;
    /** The id of the scene the user is looking at. */
    readonly viewedScene?: string | null;
  }

  const ChatMessage: {
    readonly implementation: {
      create(data: Record<string, unknown>): Promise<unknown>;
      getSpeaker(options: { actor?: unknown; token?: unknown }): Record<string, unknown>;
    };
  };

  interface FoundryDocument {
    /** Whether a user has this permission level on the document (e.g. "OWNER"). */
    testUserPermission?(user: UserLike, level: string): boolean;
    readonly id: string;
    readonly uuid: string;
    readonly documentName: string;
    readonly name: string;
    readonly parent: FoundryDocument | null;
    readonly flags: Readonly<Record<string, unknown>>;
    readonly isOwner: boolean;
    update(changes: Record<string, unknown>): Promise<unknown>;
    setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    getRollData?(options?: { deterministic?: boolean }): Record<string, unknown>;
    readonly sheet?: { render(options?: Record<string, unknown>): unknown; close?(): Promise<unknown> } | null;
    createEmbeddedDocuments?(name: string, data: Record<string, unknown>[]): Promise<FoundryDocument[]>;
    deleteEmbeddedDocuments?(name: string, ids: string[]): Promise<unknown>;
  }

  interface ShapeLike {
    contains(x: number, y: number): boolean;
  }

  interface TokenDocumentLike extends FoundryDocument {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly disposition: number;
    readonly hidden: boolean;
    readonly object: TokenPlaceable | null;
  }

  interface TokenPlaceable {
    readonly document: TokenDocumentLike;
    readonly actor: FoundryDocument | null;
    readonly center: { x: number; y: number };
    readonly bounds: unknown;
    readonly shape?: ShapeLike;
    getShape?(): ShapeLike | null;
  }

  interface TemplatePlaceable {
    readonly document: { x: number; y: number };
    readonly shape?: ShapeLike;
    _computeShape?(): ShapeLike | null;
  }

  interface DieTermLike {
    _number: unknown;
    _faces: unknown;
    readonly faces: number | undefined;
    modifiers: string[];
  }

  interface RollLike {
    readonly formula: string;
    readonly total: number | undefined;
    readonly dice: DieTermLike[];
    readonly terms: unknown[];
    readonly isDeterministic: boolean;
    evaluateSync(options?: { strict?: boolean }): RollLike;
    alter(multiply: number, add: number, options?: { multiplyNumeric?: boolean }): RollLike;
  }

  interface RollClass {
    new (formula: string, data?: Record<string, unknown>): RollLike;
    create(formula: string, data?: Record<string, unknown>): RollLike;
    replaceFormulaData(formula: string, data: Record<string, unknown>, options?: { missing?: string | number; warn?: boolean }): string;
    validate(formula: string): boolean;
    fromTerms(terms: unknown[]): RollLike;
  }

  interface FunctionTermLike {
    readonly rolls: RollLike[];
    terms: string[];
  }

  interface ParentheticalTermLike {
    readonly roll: RollLike | undefined;
    term: string;
  }

  interface ApplicationV2Instance {
    readonly id: string;
    readonly element: HTMLElement;
    readonly rendered: boolean;
    render(options?: boolean | Record<string, unknown>): Promise<unknown>;
    close(options?: Record<string, unknown>): Promise<unknown>;
    bringToFront(): void;
  }

  interface CompendiumLike {
    readonly collection: string;
    readonly documentName: string;
    readonly locked: boolean;
    readonly metadata: { readonly label: string };
    getDocuments(): Promise<unknown[]>;
    configure(settings: Record<string, unknown>): Promise<unknown>;
  }

  interface GraphicsLike {
    alpha: number;
    readonly destroyed: boolean;
    lineStyle(style: Record<string, unknown>): GraphicsLike;
    beginFill(color: number, alpha: number): GraphicsLike;
    drawShape(shape: ShapeLike): GraphicsLike;
    endFill(): GraphicsLike;
    destroy(): void;
  }

  type ApplicationV2Class = abstract new (options?: Record<string, unknown>) => ApplicationV2Instance;

  interface TokenLayer {
    readonly controlled: TokenPlaceable[];
    readonly placeables: TokenPlaceable[];
  }

  const Hooks: {
    on(name: string, fn: HookCallback): number;
    once(name: string, fn: HookCallback): number;
    off(name: string, id: number): void;
    call(name: string, ...args: unknown[]): boolean;
    callAll(name: string, ...args: unknown[]): boolean;
  };

  const game: {
    readonly ready: boolean;
    readonly settings: {
      register(scope: string, key: string, config: Record<string, unknown>): void;
      registerMenu(scope: string, key: string, config: Record<string, unknown>): void;
      get(scope: string, key: string): unknown;
      set(scope: string, key: string, value: unknown): Promise<unknown>;
    };
    readonly i18n: {
      localize(key: string): string;
      format(key: string, data?: Record<string, unknown>): string;
      has(key: string): boolean;
      readonly lang: string;
    };
    readonly user: UserLike & {
      readonly targets: Iterable<TokenPlaceable>;
      readonly character: FoundryDocument | null;
    };
    readonly actors: Iterable<FoundryDocument>;
    readonly items: Iterable<FoundryDocument>;
    readonly packs: Iterable<CompendiumLike> & { get(id: string): CompendiumLike | undefined };
    readonly modules: { get(id: string): { readonly active: boolean; readonly version: string; api?: unknown } | undefined };
    readonly combat: (FoundryDocument & {
      readonly started: boolean;
      readonly round: number;
      readonly turn: number | null;
      readonly turns: unknown[];
    }) | null;
    readonly socket: {
      /** Foundry passes the id of the user who sent the message; the message itself cannot be trusted to say. */
      on(channel: string, fn: (message: unknown, senderId: string) => void): void;
      emit(channel: string, message: unknown): void;
    };
    readonly users: Iterable<UserLike> & {
      readonly activeGM: UserLike | null;
      get(id: string): UserLike | undefined;
    };
    readonly messages: { get(id: string): unknown };
    readonly scenes: Iterable<unknown> & { get(id: string): unknown };
  };

  const CONFIG: {
    readonly Dice: { readonly DamageRoll: RollClass };
    readonly DND5E: Readonly<Record<string, unknown>>;
    readonly statusEffects: readonly unknown[];
    readonly Item: { readonly typeLabels: Readonly<Record<string, string>> };
    readonly RegionBehavior: {
      readonly dataModels: Record<string, unknown>;
      readonly typeLabels: Record<string, string>;
      readonly typeIcons: Record<string, string>;
      readonly typeHints: Record<string, string>;
    };
  };

  const Roll: RollClass;

  const foundry: {
    /** The canvas classes; their globals (CanvasAnimation, ClockwiseSweepPolygon) are deprecated since v13. */
    readonly canvas: {
      readonly animation: {
        readonly CanvasAnimation: {
          animate(attributes: { parent: unknown; attribute: string; to: number }[], options: { name: string; duration: number }): Promise<unknown>;
        };
      };
      readonly geometry: {
        readonly ClockwiseSweepPolygon: { create(origin: { x: number; y: number }, config: Record<string, unknown>): ShapeLike };
      };
    };
    readonly dice: {
      readonly terms: {
        readonly FunctionTerm: abstract new (...args: never[]) => FunctionTermLike;
        readonly ParentheticalTerm: abstract new (...args: never[]) => ParentheticalTermLike;
      };
    };
    readonly utils: {
      isNewerVersion(version: string, target: string): boolean;
      escapeHTML(text: string): string;
      saveDataToFile(data: string, type: string, filename: string): void;
    };
    readonly data: {
      /** v14 update operators; the "-=" and "==" key syntax is deprecated. */
      readonly operators: {
        readonly ForcedDeletion: new () => unknown;
        readonly ForcedReplacement: { create(value: unknown): unknown };
      };
      readonly regionBehaviors: {
        readonly RegionBehaviorType: RegionBehaviorTypeClass & { _createEventsField(): unknown };
      };
    };
    readonly applications: {
      readonly instances: Map<string, unknown>;
      readonly api: {
        readonly ApplicationV2: ApplicationV2Class;
        readonly DialogV2: {
          wait(config: Record<string, unknown>): Promise<unknown>;
          confirm(config: Record<string, unknown>): Promise<boolean>;
        };
      };
      readonly ux: {
        readonly TextEditor: {
          readonly implementation: { enrichHTML(content: string, options?: Record<string, unknown>): Promise<string> };
        };
      };
    };
  };

  const dnd5e: {
    readonly utils: { simplifyBonus(bonus: unknown, data?: Record<string, unknown>): number };
    readonly dice: { simplifyRollFormula(formula: string, options?: { preserveFlavor?: boolean }): string };
    readonly documents: {
      readonly Trait: { choices(category: string): Promise<unknown> };
      readonly Scaling: new (scale: number) => unknown;
    };
  };

  const canvas: {
    readonly ready: boolean;
    readonly grid: {
      readonly type: number;
      readonly isGridless: boolean;
      readonly distance: number;
      getOffsetRange(bounds: unknown): [number, number, number, number];
      getCenterPoint(offset: { i: number; j: number }): { x: number; y: number };
      getCircle(center: { x: number; y: number }, radius: number): { x: number; y: number }[];
    };
    readonly dimensions: { readonly size: number };
    readonly tokens: TokenLayer;
    readonly interface: { addChild(child: GraphicsLike): unknown };
  };

  const CONST: { readonly GRID_TYPES: { readonly GRIDLESS: number } };

  const ui: {
    readonly notifications: {
      info(message: string, options?: Record<string, unknown>): void;
      warn(message: string, options?: Record<string, unknown>): void;
      error(message: string, options?: Record<string, unknown>): void;
    };
  };

  const PIXI: {
    readonly Polygon: new (points: { x: number; y: number }[] | number[]) => ShapeLike;
    readonly Graphics: new () => GraphicsLike;
  };

  function fromUuid(uuid: string): Promise<unknown>;
  function fromUuidSync(uuid: string): unknown;
}
