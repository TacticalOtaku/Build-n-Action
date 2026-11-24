import { type ReactNode, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import type { BlueprintNode, BlueprintSource } from "../../core/blueprint/types";
import type { BlueprintRun, CheckTrace } from "../../core/engine/interpreter";
import type { Reason } from "../../core/engine/reasons";
import type { RollMode } from "../../core/facts/types";
import type { Translator } from "../../core/i18n";
import { STATIC } from "../../core/registry/choices";
import { EVENT_TYPES, type EventType, type NodeKind, type PinId } from "../../core/registry/constants";
import { asString } from "../../core/registry/data";
import type { ChoiceSpec } from "../../core/registry/fields";
import { getCheck, getResult } from "../../core/registry/index";
import type { PhraseFormatter } from "../../core/registry/types";
import { nodeTitle } from "../canvas/node-title";
import type { CanvasTrace, NodeRunStatus } from "../canvas/trace";
import type { SimulationOption, SimulationRequest, SimulationResult, SimulatorHost } from "../host";
import { Icon } from "../icons";
import { useChoiceOptions } from "../inspector/useChoiceOptions";
import { useServices, useT } from "../services";

const ABILITIES = { source: "abilities" } as const;
const SKILLS = { source: "skills" } as const;
const NEEDS_ABILITY: readonly EventType[] = ["abilityCheck", "savingThrow", "afterCheck"];
const NEEDS_SKILL: readonly EventType[] = ["abilityCheck", "afterCheck"];
const NOTE_KEYS = { suppressed: "BNA.UI.Sim.noteSuppressed", noToken: "BNA.UI.Sim.noteNoToken", trigger: "BNA.UI.Sim.noteTrigger", chosen: "BNA.UI.Sim.noteChosen" } as const;
const KIND_ORDER: Record<NodeKind, number> = { event: 0, condition: 1, result: 2 };
const LISTED_REASON_VALUES = ["actual", "expected"] as const;

export interface OutcomeOption {
  id: PinId;
  pins: readonly PinId[];
}

export interface EventOption {
  key: string;
  event: EventType;
  signal: string | null;
}

export interface Subjects {
  actors: readonly SimulationOption[];
  targets: readonly SimulationOption[];
}

export interface RunStep {
  nodeId: string;
  kind: NodeKind;
  status: NodeRunStatus;
  reason: Reason | null;
  checks: readonly CheckTrace[];
}

export interface RunSummary {
  trace: CanvasTrace;
  /** Nodes the run reached, in reading order. */
  steps: RunStep[];
  /** Why nothing applies: the first failed node and check; null when something would apply. */
  firstFailure: { nodeId: string | null; checkId: string | null; reason: Reason } | null;
}

const OUTCOMES: Partial<Record<EventType, readonly OutcomeOption[]>> = {
  afterAttack: [
    { id: "hit", pins: ["hit"] },
    { id: "crit", pins: ["hit", "crit"] },
    { id: "miss", pins: ["miss"] },
    { id: "fumble", pins: ["miss", "fumble"] }
  ],
  afterTargetSave: [{ id: "failed", pins: ["failed"] }, { id: "succeeded", pins: ["succeeded"] }],
  afterDamage: [{ id: "dealt", pins: ["dealt"] }, { id: "dropped", pins: ["dealt", "dropped"] }],
  afterCheck: [{ id: "success", pins: ["success"] }, { id: "failure", pins: ["failure"] }]
};

export function outcomeOptions(event: EventType): readonly OutcomeOption[] {
  return OUTCOMES[event] ?? [];
}

/** The events a test can fire: each event type in the blueprint once, and each named signal once. */
export function eventOptions(blueprint: BlueprintSource): EventOption[] {
  const options = new Map<string, EventOption>();
  for (const node of blueprint.nodes) {
    if ((node.kind !== "event") || !(EVENT_TYPES as readonly string[]).includes(node.type)) continue;
    const event = node.type as EventType;
    if (event === "signal") {
      const name = asString(node.data.name).trim();
      if (name) options.set(`signal:${name}`, { key: `signal:${name}`, event, signal: name });
    } else if (!options.has(event)) {
      options.set(event, { key: event, event, signal: null });
    }
  }
  return [...options.values()];
}

/** External store reading the host's actors/targets once per revision. */
export function subjectStore(simulator: SimulatorHost): {
  subscribe(listener: () => void): () => void;
  getSnapshot(): Subjects;
} {
  let cached: { revision: number; subjects: Subjects } | null = null;
  return {
    subscribe: listener => simulator.subscribe?.(listener) ?? (() => undefined),
    getSnapshot: () => {
      const revision = simulator.revision?.() ?? 0;
      if (cached?.revision !== revision) cached = { revision, subjects: { actors: simulator.actors(), targets: simulator.targets() } };
      return cached.subjects;
    }
  };
}

function readingOrder(a: BlueprintNode, b: BlueprintNode): number {
  return (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || (a.position.x - b.position.x) || (a.position.y - b.position.y);
}

export function summarizeRun(blueprint: BlueprintSource, run: BlueprintRun): RunSummary {
  const nodes: Record<string, NodeRunStatus> = {};
  for (const node of blueprint.nodes) nodes[node.id] = run.nodes[node.id]?.status ?? "skipped";
  const trace: CanvasTrace = { nodes, edges: new Set(run.edges) };

  const steps: RunStep[] = [...blueprint.nodes].sort(readingOrder).flatMap(node => {
    const traced = run.nodes[node.id];
    if (!traced || (traced.status === "skipped")) return [];
    return [{ nodeId: node.id, kind: node.kind, status: traced.status, reason: traced.reason ?? null, checks: traced.checks ?? [] }];
  });

  let firstFailure: RunSummary["firstFailure"] = null;
  if (run.skipped) {
    firstFailure = { nodeId: null, checkId: null, reason: run.skipped };
  } else if (!run.intents.length) {
    const failed = steps.find(step => step.status === "failed");
    const check = failed?.checks.find(entry => !entry.outcome.pass);
    const reason = check?.outcome.reason ?? failed?.reason;
    if (failed && reason) firstFailure = { nodeId: failed.nodeId, checkId: check?.checkId ?? null, reason };
  }
  return { trace, steps, firstFailure };
}

/** The choice list a check's values come from, if it has one. */
export function checkChoices(type: string): ChoiceSpec | null {
  return getCheck(type)?.reasonChoices ?? null;
}

/** A reason as text; with a choice list, stored values ("humanoid, elf") show as their labels. */
export function reasonText(reason: Reason, t: Translator["t"], fmt?: PhraseFormatter, spec?: ChoiceSpec | null): string {
  if (!reason.values) return t(`BNA.Reason.${reason.code}`);
  const values: Record<string, string | number> = { ...reason.values };
  if (fmt && spec) {
    for (const key of LISTED_REASON_VALUES) {
      const value = values[key];
      if ((typeof value === "string") && (value !== "—")) values[key] = value.split(", ").map(part => fmt.choice(part, spec)).join(", ");
    }
  }
  return t(`BNA.Reason.${reason.code}`, values);
}

export interface SimulatorPanelProps {
  blueprint: BlueprintSource;
  simulator: SimulatorHost;
  /** The run's canvas trace, or null when there is none. */
  onTrace(trace: CanvasTrace | null): void;
  onFocus(nodeId: string): void;
}

interface Setup {
  actorUuid: string;
  /** "<item uuid>#<activity id>", or "" for no item. */
  item: string;
  targetUuid: string;
  eventKey: string;
  outcome: string;
  rollMode: RollMode;
  saveOutcome: "succeeded" | "failed";
  abilityId: string;
  skillId: string;
  /** Counter values typed for the run, by "<scope>:<name>". */
  counters: Record<string, string>;
}

type Outcome = { result: SimulationResult; summary: RunSummary } | { error: string } | null;

/** The type of the check behind a run's first failure, for labelling its values. */
function failedCheckType(summary: RunSummary): string {
  const id = summary.firstFailure?.checkId;
  return (id && summary.steps.flatMap(step => step.checks).find(check => check.checkId === id)?.type) || "";
}

function itemKey(itemUuid: string, activityId: string): string {
  return `${itemUuid}#${activityId}`;
}

function usesRollModes(blueprint: BlueprintSource): boolean {
  return blueprint.nodes.some(node => (node.kind === "condition") && Array.isArray(node.data.checks)
    && (node.data.checks as { type?: unknown }[]).some(check => check.type === "rollModes"));
}

function initialSetup(simulator: SimulatorHost): Setup {
  const defaults = simulator.defaults();
  const actorUuid = defaults.actorUuid ?? simulator.actors()[0]?.value ?? "";
  const item = actorUuid ? simulator.items(actorUuid).find(entry => entry.uuid === defaults.itemUuid) : undefined;
  return {
    actorUuid,
    item: item ? itemKey(item.uuid, item.activities[0]?.value ?? "") : "",
    targetUuid: defaults.targetUuid ?? "",
    eventKey: "",
    outcome: "",
    rollMode: "normal",
    saveOutcome: "failed",
    abilityId: "",
    skillId: "",
    counters: {}
  };
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="bna-sim__field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

export function SimulatorPanel({ blueprint, simulator, onTrace, onFocus }: SimulatorPanelProps) {
  const t = useT();
  const { fmt } = useServices();
  const [setup, setSetup] = useState<Setup>(() => initialSetup(simulator));
  const change = (patch: Partial<Setup>) => setSetup(previous => ({ ...previous, ...patch }));

  const subjects = useMemo(() => subjectStore(simulator), [simulator]);
    const { actors, targets } = useSyncExternalStore(subjects.subscribe, subjects.getSnapshot);
  const actorGroups = [...new Set(actors.map(actor => actor.group ?? ""))];
  // A chosen roller or target whose token was deleted falls back to the first roller, or to no target.
  const actorUuid = actors.some(actor => actor.value === setup.actorUuid) ? setup.actorUuid : (actors[0]?.value ?? "");
  const targetUuid = targets.some(target => target.value === setup.targetUuid) ? setup.targetUuid : "";
  const items = useMemo(() => (actorUuid ? simulator.items(actorUuid) : []), [simulator, actorUuid]);
  const abilities = useChoiceOptions(ABILITIES);
  const skills = useChoiceOptions(SKILLS);

  const events = useMemo(() => eventOptions(blueprint), [blueprint]);
  const event = events.find(entry => entry.key === setup.eventKey) ?? events[0] ?? null;
  const outcomes = event ? outcomeOptions(event.event) : [];
  const outcome = outcomes.find(entry => entry.id === setup.outcome) ?? outcomes[0] ?? null;
  const needsAbility = !!event && NEEDS_ABILITY.includes(event.event);
  const needsSkill = !!event && NEEDS_SKILL.includes(event.event);
  const abilityId = needsAbility ? (setup.abilityId || abilities[0]?.value || null) : null;
  const skillId = needsSkill ? (setup.skillId || null) : null;

  const counterRows = useMemo(
    () => (actorUuid ? (simulator.counterValues?.(actorUuid, blueprint) ?? []) : []),
    [simulator, actorUuid, blueprint]
  );
  const counterKey = (row: { scope: string; name: string }) => `${row.scope}:${row.name}`;
  const needsRollMode = !!event && usesRollModes(blueprint) && !!getCheck("rollModes")?.relevantTo.includes(event.event);
  const demands = blueprint.nodes.some(node => (node.kind === "result") && !!getResult(node.type)?.pins?.length);
  const eventKey = event?.key ?? null;
  const result = useMemo<Outcome>(() => {
    const chosen = events.find(entry => entry.key === eventKey);
    if (!chosen || !actorUuid) return null;
    const options = outcomeOptions(chosen.event);
    const pins = (options.find(entry => entry.id === setup.outcome) ?? options[0])?.pins ?? ["out"];
    const [itemUuid = "", activityId = ""] = setup.item.split("#");
    const request: SimulationRequest = {
      actorUuid,
      itemUuid: itemUuid || null,
      activityId: activityId || null,
      targetUuid: targetUuid || null,
      event: chosen.event,
      pins,
      signal: chosen.signal,
      abilityId,
      skillId,
      ...(needsRollMode ? { rollMode: setup.rollMode } : {}),
      saveOutcome: setup.saveOutcome,
      counters: Object.fromEntries(counterRows.map(row => [counterKey(row), Number(setup.counters[counterKey(row)] ?? row.value) || 0]))
    };
    try {
      const run = simulator.run(blueprint, request);
      return run ? { result: run, summary: summarizeRun(blueprint, run.run) } : null;
    } catch (error) {
      return { error: (error instanceof Error) ? error.message : String(error) };
    }
  }, [simulator, blueprint, events, eventKey, setup.outcome, needsRollMode, setup.rollMode, setup.saveOutcome, actorUuid, setup.item, targetUuid, abilityId, skillId, setup.counters, counterRows]);

  const trace = (result && ("summary" in result)) ? result.summary.trace : null;
  useEffect(() => onTrace(trace), [trace, onTrace]);
  useEffect(() => () => onTrace(null), [onTrace]);

  if (!actors.length) return <p className="bna-drawer__empty">{t("BNA.UI.Sim.noActors")}</p>;
  if (!events.length) return <p className="bna-drawer__empty">{t("BNA.UI.Sim.noEvents")}</p>;

  const byId = new Map(blueprint.nodes.map(node => [node.id, node]));
  const title = (nodeId: string) => {
    const node = byId.get(nodeId);
    return node ? nodeTitle(node, t) : nodeId;
  };

  return (
    <div className="bna-sim">
      <form className="bna-sim__setup" aria-label={t("BNA.UI.Sim.setup")} onSubmit={submit => submit.preventDefault()}>
        <Field label={t("BNA.UI.Sim.actor")}>
          {id => (
            <select id={id} className="bna-select" value={actorUuid} onChange={input => change({ actorUuid: input.target.value, item: "" })}>
              {actorGroups.map(group => group ? (
                <optgroup key={group} label={group}>
                  {actors.filter(actor => actor.group === group).map(actor => <option key={actor.value} value={actor.value}>{actor.label}</option>)}
                </optgroup>
              ) : actors.filter(actor => !actor.group).map(actor => <option key={actor.value} value={actor.value}>{actor.label}</option>))}
            </select>
          )}
        </Field>
        <Field label={t("BNA.UI.Sim.item")}>
          {id => (
            <select id={id} className="bna-select" value={setup.item} onChange={input => change({ item: input.target.value })}>
              <option value="">{t("BNA.UI.Sim.noItem")}</option>
              {items.map(item => (item.activities.length ? (
                <optgroup key={item.uuid} label={item.name}>
                  {item.activities.map(activity => (
                    <option key={activity.value} value={itemKey(item.uuid, activity.value)}>{`${item.name}: ${activity.label}`}</option>
                  ))}
                </optgroup>
              ) : <option key={item.uuid} value={itemKey(item.uuid, "")}>{item.name}</option>))}
            </select>
          )}
        </Field>
        <Field label={t("BNA.UI.Sim.target")}>
          {id => (
            <select id={id} className="bna-select" value={targetUuid} onChange={input => change({ targetUuid: input.target.value })}>
              <option value="">{t("BNA.UI.Sim.noTarget")}</option>
              {targets.map(target => <option key={target.value} value={target.value}>{target.label}</option>)}
            </select>
          )}
        </Field>
        <Field label={t("BNA.UI.Sim.event")}>
          {id => (
            <select id={id} className="bna-select" value={event?.key ?? ""} onChange={input => change({ eventKey: input.target.value, outcome: "" })}>
              {events.map(entry => (
                <option key={entry.key} value={entry.key}>
                  {entry.signal ? t("BNA.UI.Node.signal", { name: entry.signal }) : t(`BNA.Event.${entry.event}.Label`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {outcomes.length ? (
          <div className="bna-sim__field" role="group" aria-label={t("BNA.UI.Sim.outcome")}>
            <span className="bna-sim__legend">{t("BNA.UI.Sim.outcome")}</span>
            <div className="bna-sim__outcomes">
              {outcomes.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  className="bna-sim__outcome"
                  aria-pressed={entry.id === outcome?.id}
                  onClick={() => change({ outcome: entry.id })}
                >
                  {t(`BNA.Pin.${entry.id}.Label`)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {needsRollMode ? (
          <div className="bna-sim__field" role="group" aria-label={t("BNA.UI.Sim.rollMode")}>
            <span className="bna-sim__legend">{t("BNA.UI.Sim.rollMode")}</span>
            <div className="bna-sim__outcomes">
              {STATIC.rollMode.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className="bna-sim__outcome"
                  aria-pressed={option.value === setup.rollMode}
                  onClick={() => change({ rollMode: option.value as RollMode })}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {demands ? (
          <div className="bna-sim__field" role="group" aria-label={t("BNA.Event.demandedSave.Label")}>
            <span className="bna-sim__legend">{t("BNA.Event.demandedSave.Label")}</span>
            <div className="bna-sim__outcomes">
              {(["failed", "succeeded"] as const).map(pin => (
                <button
                  key={pin}
                  type="button"
                  className="bna-sim__outcome"
                  aria-pressed={pin === setup.saveOutcome}
                  onClick={() => change({ saveOutcome: pin })}
                >
                  {t(`BNA.Pin.${pin}.Label`)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {counterRows.length ? (
          <div className="bna-sim__field" role="group" aria-label={t("BNA.UI.Sim.counters")}>
            <span className="bna-sim__legend">{t("BNA.UI.Sim.counters")}</span>
            {counterRows.map(row => (
              <Field key={counterKey(row)} label={row.name}>
                {id => (
                  <input
                    id={id}
                    className="bna-input"
                    inputMode="numeric"
                    value={setup.counters[counterKey(row)] ?? String(row.value)}
                    onChange={input => change({ counters: { ...setup.counters, [counterKey(row)]: input.target.value } })}
                  />
                )}
              </Field>
            ))}
          </div>
        ) : null}
        {needsAbility ? (
          <Field label={t("BNA.UI.Sim.ability")}>
            {id => (
              <select id={id} className="bna-select" value={abilityId ?? ""} onChange={input => change({ abilityId: input.target.value })}>
                {abilities.map(ability => <option key={ability.value} value={ability.value}>{ability.label}</option>)}
              </select>
            )}
          </Field>
        ) : null}
        {needsSkill ? (
          <Field label={t("BNA.UI.Sim.skill")}>
            {id => (
              <select id={id} className="bna-select" value={skillId ?? ""} onChange={input => change({ skillId: input.target.value })}>
                <option value="">{t("BNA.UI.Sim.noSkill")}</option>
                {skills.map(skill => <option key={skill.value} value={skill.value}>{skill.label}</option>)}
              </select>
            )}
          </Field>
        ) : null}
      </form>

      <div className="bna-sim__report" aria-live="polite">
        {(result && ("error" in result)) ? <p className="bna-sim__error">{t("BNA.UI.Sim.failed", { message: result.error })}</p> : null}
        {(result && ("summary" in result)) ? (
          <>
            {result.result.notes.map(note => <p key={note} className="bna-sim__note">{t(NOTE_KEYS[note])}</p>)}
            {result.result.run.intents.length ? (
              <section className="bna-sim__verdict" data-verdict="applies">
                <h3>{t("BNA.UI.Sim.applies", { count: result.result.run.intents.length })}</h3>
                <ul>
                  {result.result.run.intents.map(intent => (
                    <li key={intent.nodeId}>
                      <span>{getResult(intent.type)?.phrase(intent.data, fmt) ?? intent.type}</span>
                      {intent.common.optional ? <span className="bna-sim__tag">{t("BNA.UI.Node.optional")}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <section className="bna-sim__verdict" data-verdict="nothing">
                <h3>{t("BNA.UI.Sim.nothing")}</h3>
                {result.summary.firstFailure ? (
                  <p>
                    {result.summary.firstFailure.nodeId ? `${title(result.summary.firstFailure.nodeId)}: ` : ""}
                    {reasonText(result.summary.firstFailure.reason, t, fmt, checkChoices(failedCheckType(result.summary)))}
                  </p>
                ) : null}
                {result.summary.firstFailure?.nodeId ? (
                  <button type="button" className="bna-button" onClick={() => onFocus(result.summary.firstFailure?.nodeId ?? "")}>
                    {t("BNA.UI.Sim.whyNot")}
                  </button>
                ) : null}
              </section>
            )}
            <h4 className="bna-sim__subhead">{t("BNA.UI.Sim.path")}</h4>
            <ol className="bna-sim__steps">
              {result.summary.steps.map(step => (
                <li key={step.nodeId} data-status={step.status} data-kind={step.kind}>
                  <Icon name={(step.status === "passed") ? "check" : "x"} size={14} />
                  <span className="bna-visually-hidden">{t((step.status === "passed") ? "BNA.UI.Node.passed" : "BNA.UI.Node.failed")}</span>
                  <span className="bna-sim__step-title">{title(step.nodeId)}</span>
                  {step.reason ? <span className="bna-sim__reason">{reasonText(step.reason, t)}</span> : null}
                  {step.checks.length ? (
                    <ul>
                      {step.checks.map(check => (
                        <li key={check.checkId} data-status={check.outcome.pass ? "passed" : "failed"}>
                          <Icon name={check.outcome.pass ? "check" : "x"} size={12} />
                          <span className="bna-visually-hidden">{t(check.outcome.pass ? "BNA.UI.Node.passed" : "BNA.UI.Node.failed")}</span>
                          <span>{getCheck(check.type) ? t(`BNA.Check.${check.type}.Label`) : check.type}</span>
                          <span className="bna-sim__reason">{reasonText(check.outcome.reason, t, fmt, checkChoices(check.type))}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </div>
    </div>
  );
}
