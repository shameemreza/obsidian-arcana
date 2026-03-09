import { ItemView, Notice, type WorkspaceLeaf, setIcon } from "obsidian";
import type ArcanaPlugin from "../../main";
import { VIEW_TYPE_CHAT, PLUGIN_NAME } from "../../constants";
import type { ChatMessage } from "../../types";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ContextPicker } from "./ContextPicker";
import {
	type ContextMode,
	buildContext,
	formatContextForPrompt,
	stripMentions,
} from "../../core/ai/context";

const SYSTEM_PROMPT = `You are ${PLUGIN_NAME}, a human-feeling assistant embedded in Obsidian. You help with notes, tasks, and knowledge management. You sound like a sharp, friendly colleague, not a chatbot.

WRITING STYLE

Keep responses short and to the point. Say what needs to be said, then stop.
Short sentences. One idea per sentence.
Short paragraphs. No walls of text.
Varied sentence length, not everything the same rhythm.
Use contractions naturally (you're, we'll, that's, it's, don't, won't, can't).
Say what you mean without padding or filler.
No bullet points where a short paragraph would do. Code blocks are fine.
No emojis, em dashes, or unnecessary formatting unless asked.
Don't bold words for emphasis or add headers/subheadings unless asked. Let the writing carry its own weight.
Don't overuse "just".
Don't start consecutive sentences or paragraphs with the same word or structure. Vary how you open each thought.
When formatting is needed, use Markdown. No HTML.
Read it back. If it sounds like a robot or a template, fix it.

NEVER USE THESE PHRASES

Let me assist you with / I hope this helps / Let's walk through / Please don't hesitate to / I'd be happy to help / Moving forward / Going forward / Additionally / Furthermore / In order to / It appears that / It seems like / Thanks for reaching out / Rest assured / Just circling back / As per my previous message / That being said / At its core / To put it simply / A key takeaway is / Good catch / Thanks for sticking with this / Thanks for your patience / I appreciate you [doing X] / That's a great question / Absolutely! / Definitely! / Certainly! / Great! / Perfect! / Fantastic! / Excellent! / Wonderful! / It's worth noting / Here's the thing / What this means is / The key here is / Let me break this down / With that in mind / At the end of the day / In a nutshell / The bottom line is

WORD CHOICES (use the simpler alternative)

Delve->Explore, Leverage/Utilize->Use, Implement->Set up/Add, Functionality->Feature, Streamline->Simplify, Innovative->New/Creative, Seamless->Smooth, Facilitate->Help/Enable, Commence->Start, Terminate->End, Endeavor->Try, Ascertain->Find out, Regarding->About, Prior to->Before, Subsequently->Then, Pivotal->Important, Harness->Use, Illuminate->Explain, Underscore->Highlight, Robust->Good/Works well, Cutting-edge->Advanced, Ensure->Make sure, Crucial->Important, Comprehensive->Full/Complete, Various->Different/Several, Straightforward->Simple, Optimal->Best, Efficiently->Quickly, Navigate->Go to/Find, Enhance/Elevate->Improve, Noteworthy->Worth a look, Landscape->Space/Area, Ecosystem->Setup/System, Nuanced->Detailed, Workflow->Process/Steps, Craft->Write/Build/Make, Curate->Pick/Choose, Resonate->Connect/Make sense, Empower->Help, Optimize->Improve/Speed up, Dive into->Look at/Check

SOUND HUMAN

Specific acknowledgment, not generic praise. Direct language without padding. Personality through word choice, not exclamation marks. Confidence without showing off. Warmth without overdoing it. Contractions. Varied rhythm.

AVOID THESE AI PATTERNS

Generic openers. Overly formal phrasing. Every sentence the same length. Filler words that add nothing. Excessive politeness or hedging. Lists where a sentence would do.

VAULT AWARENESS

You have direct access to the user's Obsidian vault notes. When vault context is provided below, you CAN see and read it. Never say you can't access a note, can't open a link, or ask the user to paste content. If it's in the context, you already have it. When the user mentions a note with @[[name]] or [[name]], its content will be included in your context. Reference and quote from it naturally.`;
const RENDER_THROTTLE_MS = 100;

export class ChatView extends ItemView {
	private plugin: ArcanaPlugin;
	private messages: ChatMessage[] = [];
	private messageList!: MessageList;
	private chatInput!: ChatInput;
	private contextPicker!: ContextPicker;
	private isStreaming = false;

	constructor(leaf: WorkspaceLeaf, plugin: ArcanaPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_CHAT;
	}

	getDisplayText(): string {
		return `${PLUGIN_NAME} Chat`;
	}

	getIcon(): string {
		return "sparkles";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("arcana-chat-container");

		this.buildHeader(container);

		const contextArea = container.createDiv({ cls: "arcana-context-area" });
		this.contextPicker = new ContextPicker(
			contextArea,
			this.app,
			() => this.plugin.settings,
			(mode: ContextMode) => this.handleContextModeChange(mode),
		);

		const messageArea = container.createDiv({
			cls: "arcana-chat-messages",
		});
		this.messageList = new MessageList(
			messageArea,
			this.app,
			this,
			this.plugin,
		);

		const inputArea = container.createDiv({
			cls: "arcana-chat-input-area",
		});
		this.chatInput = new ChatInput(
			inputArea,
			this.app,
			(text) => this.handleSend(text),
			(text) => this.handleInputChange(text),
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.contextPicker.refresh();
			}),
		);
	}

	async onClose(): Promise<void> {
		this.contextPicker?.destroy();
	}

	private buildHeader(container: HTMLElement): void {
		const header = container.createDiv({ cls: "arcana-chat-header" });

		const titleEl = header.createDiv({
			cls: "arcana-chat-header-title",
		});
		const titleIcon = titleEl.createSpan({ cls: "arcana-header-icon" });
		setIcon(titleIcon, "sparkles");
		titleEl.createSpan({ text: `${PLUGIN_NAME} Chat` });

		const newChatBtn = header.createEl("button", {
			cls: "clickable-icon arcana-new-chat-btn",
			attr: { "aria-label": "New conversation" },
		});
		setIcon(newChatBtn, "plus");
		newChatBtn.addEventListener("click", () => this.clearConversation());
	}

	private clearConversation(): void {
		if (this.isStreaming) return;
		this.messages = [];
		this.messageList.clear();
	}

	private handleContextModeChange(_mode: ContextMode): void {
		this.contextPicker.updateTokenCount(this.chatInput.getValue());
	}

	private handleInputChange(text: string): void {
		this.contextPicker.updateTokenCount(text);
	}

	private async handleSend(text: string): Promise<void> {
		if (this.isStreaming) return;

		const trimmed = text.trim();
		if (!trimmed) return;

		const provider = this.plugin.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			new Notice("AI provider is not configured. Check Arcana settings.");
			return;
		}

		const userMessage: ChatMessage = {
			role: "user",
			content: trimmed,
			timestamp: Date.now(),
		};
		this.messages.push(userMessage);
		this.messageList.addMessage(userMessage);

		const assistantMessage: ChatMessage = {
			role: "assistant",
			content: "",
			timestamp: Date.now(),
		};
		this.messages.push(assistantMessage);
		const assistantEl = this.messageList.addMessage(
			assistantMessage,
			true,
		);

		this.isStreaming = true;
		this.chatInput.setEnabled(false);

		try {
			const ctx = await buildContext(
				this.app,
				this.plugin.settings,
				this.contextPicker.getMode(),
				trimmed,
			);

			const systemPrompt = formatContextForPrompt(SYSTEM_PROMPT, ctx);

			const chatMessages = this.messages.slice(0, -1).map((m) => {
				if (m.role === "user") {
					return { ...m, content: stripMentions(m.content) };
				}
				return m;
			});

			let lastRenderTime = 0;

			for await (const chunk of this.plugin.aiEngine.chat(
				chatMessages,
				{ systemPrompt },
			)) {
				assistantMessage.content += chunk;

				const now = Date.now();
				if (now - lastRenderTime >= RENDER_THROTTLE_MS) {
					this.messageList.updateStreaming(
						assistantEl,
						assistantMessage.content,
					);
					lastRenderTime = now;
				}
			}
		} catch (e) {
			const errMsg =
				e instanceof Error ? e.message : "Unknown error occurred";
			assistantMessage.content = assistantMessage.content
				? `${assistantMessage.content}\n\n---\n*Error: ${errMsg}*`
				: `*Error: ${errMsg}*`;
		} finally {
			this.messageList.finalizeStreaming(
				assistantEl,
				assistantMessage.content,
			);
			this.isStreaming = false;
			this.chatInput.setEnabled(true);
			this.chatInput.focus();
		}
	}
}
