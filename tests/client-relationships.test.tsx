import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ClientRelationships } from "@/components/relationships/client-relationships";
import type { Relationship } from "@/types/api";
import { ApiError } from "@/lib/api/client";

const mocks = vi.hoisted(() => ({ list: vi.fn(), respond: vi.fn(), revoke: vi.fn() }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ session: { accessToken: "mock-token", user: { id: "client-id" } } }) }));
vi.mock("@/lib/api/relationships", () => ({ listRelationships: mocks.list, respondToRelationship: mocks.respond, revokeRelationship: mocks.revoke }));

const counselor = { id: "counselor-id", email: "counselor@example.com", firstName: "Alex", lastName: "Counselor", username: null, phone: null, status: "ACTIVE" as const, role: { code: "COUNSELOR" as const } };
const client = { ...counselor, id: "client-id", role: { code: "CLIENT" as const } };
function relationship(status: Relationship["status"]): Relationship {
  return { id: "relationship-id", counselorId: counselor.id, clientId: client.id, status, requestedAt: "2026-01-01T00:00:00Z", respondedAt: null, endedAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", deletedAt: null, counselor, client };
}
beforeEach(() => { vi.resetAllMocks(); mocks.list.mockResolvedValue([]); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("client relationships", () => {
  it("shows loading and the empty states", async () => {
    let resolve!: (value: Relationship[]) => void;
    mocks.list.mockReturnValue(new Promise<Relationship[]>((done) => { resolve = done; }));
    render(<ClientRelationships />);
    expect(screen.getByText("Loading relationships…")).toBeTruthy();
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    await act(async () => resolve([]));
    expect(await screen.findByText("No incoming requests.")).toBeTruthy();
    expect(screen.getByText("No active counselor relationships.")).toBeTruthy();
    expect(screen.getByText("No rejected or revoked relationships.")).toBeTruthy();
  });

  it("displays an incoming request and counselor identity", async () => {
    mocks.list.mockResolvedValue([relationship("PENDING"), { ...relationship("PENDING"), id: "other", clientId: "other-client" }]);
    render(<ClientRelationships />);
    expect(await screen.findByText("Alex Counselor")).toBeTruthy();
    expect(screen.getByText("counselor@example.com")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(1);
  });

  it.each([["Accept", "ACTIVE", "Request accepted."], ["Reject", "REJECTED", "Request rejected."]] as const)("%ss an incoming request and refreshes", async (button, status, message) => {
    mocks.list.mockResolvedValueOnce([relationship("PENDING")]).mockResolvedValueOnce([relationship(status)]);
    mocks.respond.mockResolvedValue({});
    render(<ClientRelationships />);
    fireEvent.click(await screen.findByRole("button", { name: button }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", message);
    expect(mocks.respond).toHaveBeenCalledWith("mock-token", "relationship-id", status);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    const group = screen.getByRole("region", { name: status === "ACTIVE" ? "Active relationships" : "Past relationships" });
    expect(await within(group).findByText("Alex Counselor")).toBeTruthy();
  });

  it("shows an active relationship and revokes only after confirmation", async () => {
    mocks.list.mockResolvedValueOnce([relationship("ACTIVE")]).mockResolvedValueOnce([relationship("REVOKED")]);
    mocks.revoke.mockResolvedValue({});
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ClientRelationships />);
    const button = await screen.findByRole("button", { name: "Revoke" });
    expect(within(screen.getByRole("region", { name: "Active relationships" })).getByText("Alex Counselor")).toBeTruthy();
    fireEvent.click(button);
    expect(mocks.revoke).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Relationship revoked.");
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(mocks.revoke).toHaveBeenCalledWith("mock-token", "relationship-id");
    expect(await within(screen.getByRole("region", { name: "Past relationships" })).findByText("Alex Counselor")).toBeTruthy();
  });

  it("shows a list error and supports retry", async () => {
    mocks.list.mockRejectedValueOnce(new Error("List unavailable"));
    render(<ClientRelationships />);
    expect((await screen.findByRole("alert")).textContent).toContain("List unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No incoming requests.")).toBeTruthy();
  });

  it("shows an action error and does not refresh", async () => {
    mocks.list.mockResolvedValue([relationship("PENDING")]);
    mocks.respond.mockRejectedValue(new Error("Request failed"));
    render(<ClientRelationships />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Request failed");
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it("refreshes a stale action failure while preserving its message", async () => {
    mocks.list.mockResolvedValueOnce([relationship("PENDING")]).mockResolvedValueOnce([relationship("REJECTED")]);
    mocks.respond.mockRejectedValue(new ApiError("Relationship is not pending", 400));
    render(<ClientRelationships />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Relationship is not pending");
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(await within(screen.getByRole("region", { name: "Past relationships" })).findByText("Alex Counselor")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("prevents duplicate actions while a request is pending", async () => {
    let resolve!: (value: object) => void;
    mocks.list.mockResolvedValue([relationship("PENDING")]);
    mocks.respond.mockReturnValue(new Promise<object>((done) => { resolve = done; }));
    render(<ClientRelationships />);
    const accept = await screen.findByRole("button", { name: "Accept" });
    fireEvent.click(accept);
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(accept);
    expect(mocks.respond).toHaveBeenCalledTimes(1);
    await act(async () => resolve({}));
    await screen.findByRole("status");
  });
});
