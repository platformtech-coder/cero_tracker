import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, Wrench, ChevronDown, CheckCircle2 } from "lucide-react";
import { saveFormsConfig, rebuildForms } from "@/lib/actions/forms";
import type { SessionConfig, GradeMappingEntry, FormsConfig } from "@/lib/constants/forms";
import { extractSessionDay } from "@/lib/utils/rc";
import {
  KNOWN_ORI_SESSION_ITEM_ID,
  KNOWN_RC_LOWER_ITEM_IDS,
  KNOWN_RC_UPPER_ITEM_IDS,
  DEFAULT_ORI_SESSIONS,
  DEFAULT_RC_SESSIONS_LOWER,
  DEFAULT_RC_SESSIONS_UPPER,
} from "@/lib/constants/forms";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

// ─── Constants ────────────────────────────────────────────────
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const GRADES = ["1", "2", "3", "4", "5", "6", "7", "8"];

// ─── Sub-components ───────────────────────────────────────────

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12 }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8,
        background: "var(--bg-input)", color: "var(--text-1)", fontSize: 13,
        fontFamily: mono ? "monospace" : "inherit", boxSizing: "border-box",
      }}
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", padding: "8px 32px 8px 10px", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--bg-input)", color: "var(--text-1)", fontSize: 13,
          appearance: "none", cursor: "pointer", boxSizing: "border-box",
        }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
        background: "var(--primary-dim)", border: "1px solid var(--primary)", borderRadius: 8,
        color: "var(--primary)", fontSize: 12, fontWeight: 600, cursor: "pointer",
      }}
    >
      <Plus size={13} /> {label}
    </button>
  );
}

// ─── Session Builder ──────────────────────────────────────────
function SessionBuilder({
  sessions,
  onChange,
  label,
  hint,
}: {
  sessions: SessionConfig[];
  onChange: (s: SessionConfig[]) => void;
  label: string;
  hint?: string;
}) {
  const update = (idx: number, field: keyof SessionConfig, val: string) => {
    const next = sessions.map((s, i) => i === idx ? { ...s, [field]: val } : s);
    onChange(next);
  };
  const remove = (idx: number) => onChange(sessions.filter((_, i) => i !== idx));
  const add = () => onChange([...sessions, { day: "Saturday", startTime: "9:00 am", endTime: "9:45 am" }]);

  return (
    <div>
      {hint && <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 12px 0" }}>{hint}</p>}
      {sessions.length === 0 && (
        <div style={{ padding: "12px 16px", background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-3)", marginBottom: 12 }}>
          No sessions added yet. Click "Add Session" to add one.
        </div>
      )}
      {sessions.map((s, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
          <div>
            {i === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase" }}>Day</div>}
            <Select value={s.day} onChange={v => update(i, "day", v)} options={DAYS} />
          </div>
          <div>
            {i === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase" }}>Start Time</div>}
            <TextInput value={s.startTime} onChange={v => update(i, "startTime", v)} placeholder="7:00 pm" />
          </div>
          <div>
            {i === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase" }}>End Time</div>}
            <TextInput value={s.endTime} onChange={v => update(i, "endTime", v)} placeholder="8:00 pm" />
          </div>
          <button
            onClick={() => remove(i)}
            style={{ padding: "8px 10px", background: "var(--red-dim)", border: "1px solid var(--red)", borderRadius: 8, cursor: "pointer", color: "var(--red)", display: "flex", alignItems: "center" }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <AddButton label={label} onClick={add} />
      </div>
    </div>
  );
}

function SessionSelect({
  value,
  onChange,
  lowerOptions,
  upperOptions,
}: {
  value: string;
  onChange: (v: string) => void;
  lowerOptions: string[];
  upperOptions: string[];
}) {
  const allKnown = [...lowerOptions, ...upperOptions];
  const isCustomOrLegacy = value && !allKnown.includes(value);

  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 32px 8px 10px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--bg-input)",
          color: "var(--text-1)",
          fontSize: 13,
          appearance: "none",
          cursor: "pointer",
          boxSizing: "border-box",
        }}
      >
        {isCustomOrLegacy && (
          <option value={value}>{value} (Current / Legacy)</option>
        )}
        {lowerOptions.length > 0 && (
          <optgroup label="Grades 1–4 Sessions (Lower)">
            {lowerOptions.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </optgroup>
        )}
        {upperOptions.length > 0 && (
          <optgroup label="Grades 5–8 Sessions (Upper)">
            {upperOptions.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </optgroup>
        )}
        {lowerOptions.length === 0 && upperOptions.length === 0 && (
          <option value="">No sessions configured yet</option>
        )}
      </select>
      <ChevronDown
        size={14}
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--text-3)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ─── Grade Mapping Builder ────────────────────────────────────
function GradeMappingBuilder({
  mapping,
  onChange,
  lowerSessions,
  upperSessions,
}: {
  mapping: GradeMappingEntry[];
  onChange: (m: GradeMappingEntry[]) => void;
  lowerSessions: SessionConfig[];
  upperSessions: SessionConfig[];
}) {
  const formatSession = (s: SessionConfig) =>
    `${s.day} ${s.startTime} – ${s.endTime}`.trim();

  const lowerOptions = lowerSessions
    .filter(s => s.day && s.startTime && s.endTime)
    .map(formatSession);

  const upperOptions = upperSessions
    .filter(s => s.day && s.startTime && s.endTime)
    .map(formatSession);

  const defaultSession =
    lowerOptions[0] ||
    upperOptions[0] ||
    "Tuesday 5:00 pm – 5:45 pm";

  const update = (idx: number, field: keyof GradeMappingEntry, val: string) => {
    onChange(
      mapping.map((m, i) => {
        if (i !== idx) return m;
        const next = { ...m, [field]: val };
        if (field === "session") {
          next.sessionDay = extractSessionDay(val);
        }
        return next;
      })
    );
  };

  const remove = (idx: number) => onChange(mapping.filter((_, i) => i !== idx));

  const add = () => {
    onChange([
      ...mapping,
      {
        grade: "1",
        session: defaultSession,
        sessionDay: extractSessionDay(defaultSession),
      },
    ]);
  };

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 12px 0" }}>
        Force a specific grade to a designated session with exact day and time allocation, overriding whatever they choose on the form.
      </p>
      {mapping.length === 0 && (
        <div style={{ padding: "12px 16px", background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-3)", marginBottom: 12 }}>
          No grade mappings set. Cubs will use their chosen session.
        </div>
      )}
      {mapping.map((m, i) => {
        const currentSession = m.session || m.sessionDay || defaultSession;
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2.5fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
            <div>
              {i === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase" }}>Grade</div>}
              <Select
                value={m.grade}
                onChange={v => update(i, "grade", v)}
                options={GRADES.map(g => g)}
              />
            </div>
            <div>
              {i === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase" }}>Force to Session (Day & Time)</div>}
              <SessionSelect
                value={currentSession}
                onChange={v => update(i, "session", v)}
                lowerOptions={lowerOptions}
                upperOptions={upperOptions}
              />
            </div>
            <button
              onClick={() => remove(i)}
              style={{ padding: "8px 10px", background: "var(--red-dim)", border: "1px solid var(--red)", borderRadius: 8, cursor: "pointer", color: "var(--red)", display: "flex", alignItems: "center" }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
      <div style={{ marginTop: 8 }}>
        <AddButton label="Add Grade Mapping" onClick={add} />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export function FormsSetupTab({ initialConfig }: { initialConfig: FormsConfig }) {
  const [isPending, startTransition] = useTransition();
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false);

  // Form IDs & Item IDs
  const [oriFormId, setOriFormId] = useState(initialConfig.oriFormId);
  const [oriSessionItemId, setOriSessionItemId] = useState(initialConfig.oriSessionItemId);
  const [rcFormId, setRcFormId] = useState(initialConfig.rcFormId);
  const [rcLowerItemIds, setRcLowerItemIds] = useState(initialConfig.rcLowerItemIds.join(", "));
  const [rcUpperItemIds, setRcUpperItemIds] = useState(initialConfig.rcUpperItemIds.join(", "));

  // Sessions
  const [oriSessions, setOriSessions] = useState<SessionConfig[]>(initialConfig.oriSessions);
  const [rcSessionsLower, setRcSessionsLower] = useState<SessionConfig[]>(initialConfig.rcSessionsLower);
  const [rcSessionsUpper, setRcSessionsUpper] = useState<SessionConfig[]>(initialConfig.rcSessionsUpper);

  // Category names
  const [rcCategoryLower, setRcCategoryLower] = useState(initialConfig.rcCategoryLower);
  const [rcCategoryUpper, setRcCategoryUpper] = useState(initialConfig.rcCategoryUpper);

  // Grade mapping
  const [gradeMapping, setGradeMapping] = useState<GradeMappingEntry[]>(initialConfig.rcGradeMapping);

  const buildConfig = (): FormsConfig => ({
    oriFormId: oriFormId.trim(),
    oriSessionItemId: oriSessionItemId.trim(),
    oriSessions,
    rcFormId: rcFormId.trim(),
    rcSessionsLower,
    rcSessionsUpper,
    rcCategoryLower: rcCategoryLower.trim(),
    rcCategoryUpper: rcCategoryUpper.trim(),
    rcGradeMapping: gradeMapping.map(m => {
      const sess = m.session || m.sessionDay || "Tuesday 5:00 pm – 5:45 pm";
      return {
        grade: m.grade,
        session: sess,
        sessionDay: extractSessionDay(sess),
      };
    }),
    rcLowerItemIds: rcLowerItemIds.split(",").map(s => s.trim()).filter(Boolean),
    rcUpperItemIds: rcUpperItemIds.split(",").map(s => s.trim()).filter(Boolean),
  });

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveFormsConfig(buildConfig());
      if (res.success) toast.success("Form settings saved!");
      else toast.error("Save failed: " + res.error);
    });
  };

  const handleRebuild = () => {
    setShowRebuildConfirm(true);
  };

  const handleRebuildConfirm = async () => {
    setIsRebuilding(true);
    setShowRebuildConfirm(false);
    try {
      // Save first so rebuild uses latest values
      await saveFormsConfig(buildConfig());
      const res = await rebuildForms();
      if (res.success) toast.success("Both Google Forms rebuilt successfully!");
      else toast.error("Rebuild failed: " + res.error);
    } catch (e: any) {
      toast.error("Error: " + e.message);
    } finally {
      setIsRebuilding(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px 0" }}>Forms Setup</h2>
          <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>
            Configure sessions and grade mappings, then click <strong>Rebuild Forms</strong> to push changes to Google.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={handleSave}
            disabled={isPending}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", color: "var(--text-2)" }}
          >
            <Save size={14} /> {isPending ? "Saving…" : "Save Settings"}
          </button>
          <button
            onClick={handleRebuild}
            disabled={isRebuilding || isPending}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: isRebuilding ? 0.7 : 1 }}
          >
            <Wrench size={14} /> {isRebuilding ? "Rebuilding…" : "Rebuild Forms Now"}
          </button>
        </div>
      </div>

      {/* Phone & Sibling Matching Status */}
      <div style={{ display: "flex", gap: 10, padding: "12px 16px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10 }}>
        <CheckCircle2 size={16} style={{ color: "var(--green, #22c55e)", flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0 }}>
          <strong>Parent Phone & Sibling-Aware Matching Active:</strong> Both Orientation and Reading Circle forms collect parent phone numbers. Inbound webhooks match first by parent phone, then fuzzy-match each cub (≥80% similarity threshold) to correctly distinguish multiple siblings.
        </p>
      </div>

      {/* ── ORIENTATION ────────────────────────────────────────── */}
      <SectionCard title="🎓 Orientation Form" subtitle="Each session calculates its single next upcoming date automatically">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          <Field label="Google Form ID">
            <TextInput value={oriFormId} onChange={setOriFormId} placeholder="1euyObOz6KNG..." mono />
          </Field>
          <Field label="Session Dropdown Item ID">
            <TextInput value={oriSessionItemId} onChange={setOriSessionItemId} placeholder="465ce0fd" mono />
          </Field>
        </div>

        <SessionBuilder
          sessions={oriSessions}
          onChange={setOriSessions}
          label="Add Orientation Session"
          hint={`Each configured session generates its next upcoming date automatically on rebuild. Example output: "Tuesday (13-Oct) 7:00 pm – 8:00 pm"`}
        />
      </SectionCard>

      {/* ── READING CIRCLE ─────────────────────────────────────── */}
      <SectionCard title="📖 Reading Circle Form" subtitle="Sessions are published as recurring weekly options (no dates)">
        <Field label="Google Form ID">
          <TextInput value={rcFormId} onChange={setRcFormId} placeholder="1NQPCb59uhpmo7..." mono />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
          {/* Lower Grades */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Grades 1–4 Sessions</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Category name applied to these cubs</div>
              </div>
              <input
                value={rcCategoryLower}
                onChange={e => setRcCategoryLower(e.target.value)}
                placeholder="Word Astronauts"
                style={{ padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-input)", color: "var(--primary)", fontSize: 12, fontWeight: 700, width: 160 }}
              />
            </div>
            <SessionBuilder sessions={rcSessionsLower} onChange={setRcSessionsLower} label="Add Session (Lower)" />
          </div>

          {/* Upper Grades */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Grades 5–8 Sessions</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Category name applied to these cubs</div>
              </div>
              <input
                value={rcCategoryUpper}
                onChange={e => setRcCategoryUpper(e.target.value)}
                placeholder="Word Miners"
                style={{ padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-input)", color: "var(--green)", fontSize: 12, fontWeight: 700, width: 160 }}
              />
            </div>
            <SessionBuilder sessions={rcSessionsUpper} onChange={setRcSessionsUpper} label="Add Session (Upper)" />
          </div>
        </div>

        {/* Advanced — Item IDs */}
        <details style={{ marginTop: 20 }}>
          <summary style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", cursor: "pointer", userSelect: "none" }}>
            ▸ Advanced — RC Dropdown Item IDs (rarely needs changing)
          </summary>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
            <Field label="Lower Grade Item IDs (comma-separated)">
              <TextInput value={rcLowerItemIds} onChange={setRcLowerItemIds} mono />
            </Field>
            <Field label="Upper Grade Item IDs (comma-separated)">
              <TextInput value={rcUpperItemIds} onChange={setRcUpperItemIds} mono />
            </Field>
          </div>
        </details>
      </SectionCard>

      {/* ── GRADE MAPPING ──────────────────────────────────────── */}
      <SectionCard
        title="🔀 Grade-to-Session Mapping"
        subtitle="Force a specific grade to a designated session with exact day and time allocation"
      >
        <GradeMappingBuilder
          mapping={gradeMapping}
          onChange={setGradeMapping}
          lowerSessions={rcSessionsLower}
          upperSessions={rcSessionsUpper}
        />
      </SectionCard>

      {/* Rebuild Confirmation Modal */}
      <ConfirmModal
        isOpen={showRebuildConfirm}
        onClose={() => setShowRebuildConfirm(false)}
        onConfirm={handleRebuildConfirm}
        title="Rebuild Google Forms?"
        message="This will connect to Google and overwrite the dropdown options on both forms. Continue?"
        confirmText="Rebuild"
        variant="primary"
        isLoading={isRebuilding}
      />
    </div>
  );
}
