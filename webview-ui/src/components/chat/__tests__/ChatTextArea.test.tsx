import React from "react"
import { render, fireEvent, screen, act } from "@testing-library/react"
import "@testing-library/jest-dom"
import ChatTextArea from "../ChatTextArea"
import { ExtensionStateContext, ExtensionState } from "../../../context/ExtensionStateContext"
import { ChatSettings } from "@shared/ChatSettings"
import { vscode } from "../../../utils/vscode"

// Mock vscode API
jest.mock("../../../utils/vscode", () => ({
	vscode: {
		postMessage: jest.fn(),
	},
}))

// Mock context
const mockExtensionState: ExtensionState = {
	version: "1.0.0",
	apiConfiguration: {
		apiProvider: "testProvider",
		 μέσωApi: "testApiKey",
		openAiModelId: "testModel",
		openRouterModelId: "testOpenRouterModel",
		openRouterModelInfo: null,
		vsCodeLmModelSelector: null,
		ollamaModelId: null,
		lmStudioModelId: null,
		requestyModelId: null,
		requestyModelInfo: null,
		liteLlmModelId: null,
		liteLlmModelInfo: null,
		fireworksModelId: null,
		togetherModelId: null,
		thinkingBudgetTokens: 1000,
		reasoningEffort: "auto",
		temperature: 0.7,
		maxTokens: 1000,
		contextWindowTokens: 8000,
		awsBedrockCustomSelected: false,
		awsBedrockCustomModelBaseId: null,
	},
	uriScheme: "vscode",
	taskHistory: [],
	shouldShowAnnouncement: false,
	platform: "darwin",
	autoApprovalSettings: { enabled: false, version: 1 },
	browserSettings: { searchEngine: "google" },
	chatSettings: { mode: "act", preferredLanguage: "en", openAIReasoningEffort: "auto" } as ChatSettings,
	userInfo: null,
	mcpMarketplaceEnabled: false,
	telemetrySetting: "enabled",
	planActSeparateModelsSetting: false,
	enableCheckpointsSetting: true,
	distinctId: "test-id",
	globalClineRulesToggles: {},
	localClineRulesToggles: {},
	localWindsurfRulesToggles: {},
	localCursorRulesToggles: {},
	localWorkflowToggles: {},
	globalWorkflowToggles: {},
	shellIntegrationTimeout: 5000,
	terminalReuseEnabled: true,
	isNewUser: false,
	mcpResponsesCollapsed: false,
	filePaths: [],
	openRouterModels: [],
}

const renderChatTextArea = (props: Partial<React.ComponentProps<typeof ChatTextArea>> = {}) => {
	const defaultProps: React.ComponentProps<typeof ChatTextArea> = {
		inputValue: "",
		activeQuote: null,
		setInputValue: jest.fn(),
		sendingDisabled: false,
		placeholderText: "Type a message...",
		selectedFiles: [],
		selectedImages: [],
		setSelectedImages: jest.fn(),
		setSelectedFiles: jest.fn(),
		onSend: jest.fn(),
		onSelectFilesAndImages: jest.fn(),
		shouldDisableFilesAndImages: false,
		...props,
	}
	return render(
		<ExtensionStateContext.Provider value={{ extensionState: mockExtensionState, setExtensionState: jest.fn() }}>
			<ChatTextArea {...defaultProps} />
		</ExtensionStateContext.Provider>,
	)
}

describe("ChatTextArea Voice Input", () => {
	let setInputValueMock: jest.Mock

	beforeEach(() => {
		setInputValueMock = jest.fn()
		;(vscode.postMessage as jest.Mock).mockClear()
	})

	test("renders microphone button", () => {
		renderChatTextArea()
		expect(screen.getByLabelText("Voice Input")).toBeInTheDocument()
	})

	test("toggles voice transcription state and calls postMessage on microphone button click", () => {
		renderChatTextArea()
		const micButton = screen.getByLabelText("Voice Input")

		// Start voice chat
		fireEvent.click(micButton)
		expect(vscode.postMessage).toHaveBeenCalledWith({ command: "startVoiceChat" }) // Note: changed from type to command
		expect(micButton.querySelector(".codicon-stop-circle")).toBeInTheDocument()
		expect(screen.getByText("Listening...")).toBeInTheDocument()
		expect(screen.getByTestId("chat-input")).toBeDisabled()

		// Stop voice chat
		fireEvent.click(micButton)
		expect(vscode.postMessage).toHaveBeenCalledWith({ command: "stopVoiceChat" }) // Note: changed from type to command
		expect(micButton.querySelector(".codicon-mic")).toBeInTheDocument()
		expect(screen.queryByText("Listening...")).not.toBeInTheDocument()
		expect(screen.getByTestId("chat-input")).not.toBeDisabled()
	})

	test("handles transcribedText message from extension", () => {
		renderChatTextArea({ setInputValue: setInputValueMock })
		const micButton = screen.getByLabelText("Voice Input")

		// Start voice chat to set isVoiceTranscriptionActive to true
		fireEvent.click(micButton)
		expect(micButton.querySelector(".codicon-stop-circle")).toBeInTheDocument() // Active

		// Simulate receiving transcribed text
		act(() => {
			const event = new MessageEvent("message", {
				data: { type: "transcribedText", text: "Hello world" },
			})
			window.dispatchEvent(event)
		})

		expect(setInputValueMock).toHaveBeenCalledWith("Hello world")
		expect(micButton.querySelector(".codicon-mic")).toBeInTheDocument() // Should be inactive now
		expect(screen.queryByText("Listening...")).not.toBeInTheDocument()
		// Text area focus is hard to test accurately in jsdom without more complex setup
	})

	test("listening indicator appears and disappears", () => {
		renderChatTextArea()
		const micButton = screen.getByLabelText("Voice Input")

		expect(screen.queryByText("Listening...")).not.toBeInTheDocument()
		fireEvent.click(micButton) // Activate
		expect(screen.getByText("Listening...")).toBeInTheDocument()
		fireEvent.click(micButton) // Deactivate
		expect(screen.queryByText("Listening...")).not.toBeInTheDocument()
	})

	test("DynamicTextArea disabled prop changes", () => {
		renderChatTextArea()
		const micButton = screen.getByLabelText("Voice Input")
		const textArea = screen.getByTestId("chat-input")

		expect(textArea).not.toBeDisabled()
		fireEvent.click(micButton) // Activate
		expect(textArea).toBeDisabled()
		fireEvent.click(micButton) // Deactivate
		expect(textArea).not.toBeDisabled()
	})
})
