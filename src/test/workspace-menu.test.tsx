import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/app-sidebar";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), select: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ to, activeOptions: _active, children, onClick, ...props }: any) => <a href={to} {...props} onClick={(e) => { e.preventDefault(); onClick?.(e); }}>{children}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@/lib/workspaces", () => ({
  NAME_MAX: 60, createWorkspace: vi.fn(), setActiveWorkspace: mocks.select,
  useActiveWorkspace: () => ({ list: [{ id: "a", name: "Facts & Robi" }, { id: "b", name: "Space" }], active: { id: "a", name: "Facts & Robi" }, ready: true }),
  useWorkspaceVideos: () => [],
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });
describe("workspace menu interaction", () => {
  it("starts closed even for the active workspace and opens/closes only on click", () => {
    render(<AppSidebar />);
    const main = screen.getByRole("button", { name: "Facts & Robi" });
    expect(main).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Create video" })).toBeNull();
    fireEvent.click(main);
    expect(main).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Create video", "My videos", "Analytics", "Settings"]) expect(screen.getByRole("link", { name })).toBeVisible();
    expect(mocks.navigate).not.toHaveBeenCalled();
    fireEvent.click(main);
    expect(main).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Create video" })).toBeNull();
  });
  it("opens another workspace without leaving the previous menu expanded", () => {
    render(<AppSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Facts & Robi" }));
    fireEvent.click(screen.getByRole("button", { name: "Space" }));
    expect(screen.getByRole("button", { name: "Facts & Robi" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Space" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("link", { name: "My videos" }));
    expect(mocks.select).toHaveBeenLastCalledWith("b");
  });
});