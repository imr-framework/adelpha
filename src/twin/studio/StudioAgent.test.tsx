import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { StudioAgent } from "./StudioAgent";
import { createAdkSession, listAdkApps, runAdkWithFallback } from "../adkApi";
vi.mock("../adkApi", async (original) => ({ ...await original<typeof import("../adkApi")>(), listAdkApps: vi.fn(), createAdkSession: vi.fn(), runAdkWithFallback: vi.fn() }));
beforeEach(() => { vi.mocked(listAdkApps).mockResolvedValue(["dtam"]); vi.mocked(createAdkSession).mockResolvedValue({ id: "studio-session" }); vi.mocked(runAdkWithFallback).mockImplementation(async (_, handlers) => { handlers.onEvent({ content: { parts: [{ text: "# Coil design brief\n\nDefine the imaging volume." }] } }); return "sse"; }); });
it("sends the selected mode and model, opens the response canvas, and resets the conversation", async () => {
  const user = userEvent.setup(); render(<StudioAgent />);
  await user.click(screen.getByRole("button", { name: "Choose model" }));
  await user.click(screen.getByRole("button", { name: /2.5 Pro/ }));
  await user.click(screen.getByRole("button", { name: "Add context and tools" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Agent mode" }), "Design");
  await user.type(screen.getByRole("textbox", { name: "Message the agent" }), "Draft a coil brief{Enter}");
  await screen.findByRole("button", { name: "Open in canvas" });
  expect(runAdkWithFallback).toHaveBeenCalledWith(expect.objectContaining({ modelId: "gemini-2.5-pro", sessionId: "studio-session", message: expect.stringContaining("[Engineering Studio: Design]") }), expect.anything());
  await user.click(screen.getByRole("button", { name: "Open in canvas" }));
  expect(screen.getByRole("complementary", { name: "Design canvas" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Close canvas" }));
  await user.click(screen.getByRole("button", { name: "New chat" }));
  expect(screen.getByRole("heading", { name: "What would you like to build?" })).toBeInTheDocument();
});
it("preserves a draft when the backend is unreachable", async () => {
  vi.mocked(listAdkApps).mockRejectedValue(new Error("Agent unavailable"));
  const user = userEvent.setup(); render(<StudioAgent />);
  await user.type(screen.getByRole("textbox", { name: "Message the agent" }), "Review my design{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("Agent unavailable");
  expect(screen.getByRole("textbox", { name: "Message the agent" })).toHaveValue("Review my design");
});
it("stops a streaming response and keeps the partial answer", async () => {
  vi.mocked(runAdkWithFallback).mockImplementation(async (_, handlers) => {
    handlers.onEvent({ content: { parts: [{ text: "Partial design" }] } });
    await new Promise<void>((resolve) => handlers.signal?.addEventListener("abort", () => resolve())); return "sse";
  });
  const user = userEvent.setup(); render(<StudioAgent />);
  await user.type(screen.getByRole("textbox", { name: "Message the agent" }), "Design{Enter}");
  await screen.findByText("Partial design");
  await user.click(screen.getByRole("button", { name: "Stop response" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument());
  expect(screen.getByText("Partial design")).toBeInTheDocument();
});
it("attaches selected project metadata to the request", async () => {
  const { saveNewProject } = await import("./library");
  const project = saveNewProject("Composer context study", { application: "hardware" });
  const user = userEvent.setup(); render(<StudioAgent />);
  await user.click(screen.getByRole("button", { name: "Add context and tools" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Add project context" }), project.id);
  expect(screen.getByRole("button", { name: "Remove Composer context study — project summary" })).toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "Message the agent" }), "Review this project{Enter}");
  await screen.findByRole("button", { name: "Open in canvas" });
  expect(runAdkWithFallback).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('"name": "Composer context study"') }), expect.anything());
});

it("switches the idle voice action to send when a message is entered", async () => {
  const user = userEvent.setup(); render(<StudioAgent />);
  expect(screen.getByRole("button", { name: "Start voice input" })).toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "Message the agent" }), "Review a design");
  expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Start voice input" })).not.toBeInTheDocument();
});
it("explains when dictation is unavailable", async () => {
  const user = userEvent.setup(); render(<StudioAgent />);
  await user.click(screen.getByRole("button", { name: "Dictate message" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Voice input is not supported");
});
