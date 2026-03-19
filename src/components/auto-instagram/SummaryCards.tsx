type Plan = {
  dailyGoal: number;
  totalGenerated: number;
  totalCompleted: number;
  totalSkipped: number;
  totalAlreadyLiked: number;
};

type Props = {
  plan: Plan | null;
};

type CardProps = {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
};

function Card({ label, value, sub, color }: CardProps) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1 ${color}`}>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export default function SummaryCards({ plan }: Props) {
  if (!plan) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {["Today's Goal", "Generated", "Completed", "Skipped", "Already Liked"].map((label) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-100 bg-slate-50 p-4 flex flex-col gap-1"
          >
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</div>
            <div className="text-3xl font-bold text-slate-300">—</div>
          </div>
        ))}
      </div>
    );
  }

  const remaining = Math.max(
    0,
    plan.dailyGoal - plan.totalCompleted - plan.totalAlreadyLiked
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Card
        label="Today's Goal"
        value={plan.dailyGoal}
        sub="likes target"
        color="border-slate-200 bg-white"
      />
      <Card
        label="Completed"
        value={plan.totalCompleted}
        sub={`of ${plan.totalGenerated} generated`}
        color="border-emerald-100 bg-emerald-50"
      />
      <Card
        label="Remaining"
        value={remaining}
        sub="left to do"
        color={remaining > 0 ? "border-sky-100 bg-sky-50" : "border-slate-100 bg-slate-50"}
      />
      <Card
        label="Skipped"
        value={plan.totalSkipped}
        sub="will requeue tomorrow"
        color="border-amber-100 bg-amber-50"
      />
      <Card
        label="Already Liked"
        value={plan.totalAlreadyLiked}
        sub="excluded from future"
        color="border-purple-100 bg-purple-50"
      />
    </div>
  );
}
