// PROTOTYPE — throwaway. Mock Notifications for the in-app view prototype
// (wayfinder ticket "What the in-app Notification view looks like").
// Events come from the agreed list in "Which events notify which role, on
// which channel". Nothing here touches the database.

import { UserRole } from "~/db/schema";

export type Channel = "in-app" | "email";

export type MockNotification = {
  id: string;
  // "action" = Action Notification: done once anyone takes the action.
  kind: "info" | "action";
  title: string;
  body: string;
  course?: string;
  minutesAgo: number;
  read: boolean;
  // Action Notifications only: set when someone has acted.
  decidedBy?: string;
  href: string;
  cta?: string;
  channels: Channel[];
  badge?: string;
  needsPaymentProvider?: boolean;
};

let seq = 0;
const n = (x: Omit<MockNotification, "id">): MockNotification => ({
  id: `n${++seq}`,
  ...x,
});

const student = (): MockNotification[] => [
  n({
    kind: "info",
    title: "Your refund request was approved",
    body: "We've approved your refund for React Basics. Your Enrollment has ended; your progress is kept.",
    course: "React Basics",
    minutesAgo: 12,
    read: false,
    href: "/dashboard",
    channels: ["in-app", "email"],
  }),
  n({
    kind: "info",
    title: "Sam Lee replied to your comment",
    body: "“Good question! useEffect runs after paint, so the flicker you're seeing is…”",
    course: "TypeScript Fundamentals",
    minutesAgo: 47,
    read: false,
    href: "/courses",
    cta: "View reply",
    channels: ["in-app", "email"],
  }),
  n({
    kind: "info",
    title: "New lesson: Generics in practice",
    body: "A new lesson was added to Module 3 of TypeScript Fundamentals.",
    course: "TypeScript Fundamentals",
    minutesAgo: 60 * 5,
    read: false,
    href: "/courses",
    cta: "Watch now",
    channels: ["in-app"],
  }),
  n({
    kind: "info",
    title: "You completed CSS Layouts 🎉",
    body: "Every lesson done. Nice work.",
    course: "CSS Layouts",
    minutesAgo: 60 * 26,
    read: true,
    href: "/dashboard",
    channels: ["in-app", "email"],
  }),
  n({
    kind: "info",
    title: "Refund issued",
    body: "$49.00 is on its way back to your card.",
    course: "Node Streams",
    minutesAgo: 60 * 24 * 3,
    read: true,
    href: "/dashboard",
    channels: ["in-app", "email"],
    needsPaymentProvider: true,
  }),
  n({
    kind: "info",
    title: "Intro to Rust was archived",
    body: "You keep your Enrollment and progress, but the course won't get new lessons.",
    course: "Intro to Rust",
    minutesAgo: 60 * 24 * 6,
    read: true,
    href: "/dashboard",
    channels: ["in-app", "email"],
  }),
];

const teamAdmin = (): MockNotification[] => [
  n({
    kind: "info",
    title: "Alex Kim tried to claim a Seat",
    body: "Seats can't be claimed while your Refund Request on React Basics (Team Licence) is open.",
    course: "React Basics",
    minutesAgo: 5,
    read: false,
    href: "/team",
    channels: ["in-app"],
  }),
  n({
    kind: "info",
    title: "Priya Shah claimed a Seat",
    body: "7 of 10 Seats on TypeScript Fundamentals are now claimed.",
    course: "TypeScript Fundamentals",
    minutesAgo: 90,
    read: false,
    href: "/team",
    channels: ["in-app"],
  }),
  n({
    kind: "info",
    title: "All Seats claimed",
    body: "Every Seat on your CSS Layouts Team Licence has been claimed.",
    course: "CSS Layouts",
    minutesAgo: 60 * 30,
    read: true,
    href: "/team",
    channels: ["in-app", "email"],
  }),
  n({
    kind: "info",
    title: "Jordan Park completed CSS Layouts",
    body: "A Seat-holder on your Team Licence finished the course.",
    course: "CSS Layouts",
    minutesAgo: 60 * 50,
    read: true,
    href: "/team",
    channels: ["in-app"],
  }),
];

const instructor = (): MockNotification[] => [
  n({
    kind: "info",
    title: "New comment on “Narrowing with type guards”",
    body: "Maya Chen: “Why does `in` narrow here but `typeof` doesn't?”",
    course: "TypeScript Fundamentals",
    minutesAgo: 8,
    read: false,
    href: "/instructor/questions",
    cta: "Reply",
    channels: ["in-app", "email"],
  }),
  n({
    kind: "info",
    title: "3 new Enrollments",
    body: "Maya Chen, Leo Grant and 1 other enrolled on TypeScript Fundamentals.",
    course: "TypeScript Fundamentals",
    minutesAgo: 120,
    read: false,
    href: "/instructor",
    channels: ["in-app"],
  }),
  n({
    kind: "info",
    title: "New 4★ rating",
    body: "React Basics now averages 4.6★ from 38 ratings.",
    course: "React Basics",
    minutesAgo: 60 * 7,
    read: true,
    href: "/instructor/analytics",
    channels: ["in-app"],
  }),
  n({
    kind: "info",
    title: "A Platform Admin archived Intro to Rust",
    body: "Your course is no longer listed. Enrolled Students keep access.",
    course: "Intro to Rust",
    minutesAgo: 60 * 24 * 2,
    read: true,
    href: "/instructor",
    channels: ["in-app", "email"],
  }),
];

const platformAdmin = (): MockNotification[] => [
  n({
    kind: "action",
    title: "New Refund Request",
    body: "Maya Chen asks for a refund on React Basics ($49.00): “The course moved too fast for me.”",
    course: "React Basics",
    minutesAgo: 3,
    read: false,
    href: "/admin/refunds",
    cta: "Review",
    channels: ["in-app"],
    badge: "Repeat: 1 earlier decline",
  }),
  n({
    kind: "action",
    title: "Failed Refund",
    body: "The $120.00 refund to Leo Grant for Node Streams couldn't be sent.",
    course: "Node Streams",
    minutesAgo: 40,
    read: false,
    href: "/admin/refunds",
    cta: "Investigate",
    channels: ["in-app", "email"],
    needsPaymentProvider: true,
  }),
  n({
    kind: "action",
    title: "New Refund Request",
    body: "Jordan Park asks for a refund on a CSS Layouts Team Licence ($490.00).",
    course: "CSS Layouts",
    minutesAgo: 60 * 3,
    read: false,
    href: "/admin/refunds",
    cta: "Review",
    channels: ["in-app"],
    badge: "Team Licence · 10 Seats",
    decidedBy: "Priya Shah approved it",
  }),
  n({
    kind: "info",
    title: "New course published",
    body: "Sam Lee published “Testing with Vitest”.",
    course: "Testing with Vitest",
    minutesAgo: 60 * 20,
    read: true,
    href: "/admin/courses",
    channels: ["in-app"],
  }),
];

export function mockNotificationsFor(
  role: UserRole | null,
  isTeamAdmin: boolean
): MockNotification[] {
  if (role === UserRole.Admin) return platformAdmin();
  if (role === UserRole.Instructor) return instructor();
  if (isTeamAdmin) return [...teamAdmin(), ...student()];
  return student();
}

export function incomingFor(role: UserRole | null): MockNotification {
  if (role === UserRole.Admin)
    return n({
      kind: "action",
      title: "New Refund Request",
      body: "Leo Grant asks for a refund on TypeScript Fundamentals ($39.00).",
      course: "TypeScript Fundamentals",
      minutesAgo: 0,
      read: false,
      href: "/admin/refunds",
      cta: "Review",
      channels: ["in-app"],
    });
  if (role === UserRole.Instructor)
    return n({
      kind: "info",
      title: "New comment on “Generics in practice”",
      body: "Leo Grant: “Could you show a constrained generic example?”",
      course: "TypeScript Fundamentals",
      minutesAgo: 0,
      read: false,
      href: "/instructor/questions",
      cta: "Reply",
      channels: ["in-app", "email"],
    });
  return n({
    kind: "info",
    title: "Sam Lee replied in a thread you're in",
    body: "“Same issue here — the fix was to memoise the callback.”",
    course: "React Basics",
    minutesAgo: 0,
    read: false,
    href: "/courses",
    cta: "View reply",
    channels: ["in-app", "email"],
  });
}

export function timeAgo(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / (60 * 24))}d ago`;
}
