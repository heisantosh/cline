import * as vscode from "vscode"
import { Controller } from "../index" // Adjust path as necessary
import { WebviewMessage } from "@shared/WebviewMessage"
import { ExtensionMessage } from "@shared/ExtensionMessage"

// Mock vscode APIs
jest.mock(
	"vscode",
	() => ({
		commands: {
			executeCommand: jest.fn(),
		},
		window: {
			showInputBox: jest.fn(),
			showWarningMessage: jest.fn(),
			showInformationMessage: jest.fn(),
			showErrorMessage: jest.fn(),
			withProgress: jest.fn((options, task) => task({}, {})), // Simulates task execution
		},
		env: {
			uriScheme: "vscode",
		},
		Uri: {
			joinPath: jest.fn((uri, ...paths) => ({ ...uri, path: `${uri.path}/${paths.join("/")}` })),
			file: jest.fn((path) => ({ scheme: "file", path })),
		},
		ProgressLocation: {
			Notification: 15,
		},
		// Add any other vscode APIs that might be used directly or indirectly by the controller
	}),
	{ virtual: true },
)

// Mock other dependencies if necessary (e.g., services, state management)
jest.mock("@/services/posthog/telemetry/TelemetryService", () => ({
	telemetryService: {
		capture: jest.fn(),
		captureModeSwitch: jest.fn(),
		updateTelemetryState: jest.fn(),
		sendCollectedEvents: jest.fn(),
		distinctId: "mockDistinctId",
	},
}))

jest.mock("../storage/state", () => ({
	getAllExtensionState: jest.fn().mockResolvedValue({
		apiConfiguration: {},
		chatSettings: { mode: "act" },
		// ... other necessary mock state properties
	}),
	updateGlobalState: jest.fn(),
	updateWorkspaceState: jest.fn(),
	getGlobalState: jest.fn(),
	getWorkspaceState: jest.fn(),
	storeSecret: jest.fn(),
	getSecret: jest.fn(),
}))

jest.mock("../grpc-handler", () => ({
	handleGrpcRequest: jest.fn(),
	handleGrpcRequestCancel: jest.fn(),
}))

describe("Controller Voice Chat Message Handling", () => {
	let controller: Controller
	let mockPostMessageToWebview: jest.Mock<Promise<boolean>, [ExtensionMessage]>
	let mockOutputChannel: vscode.OutputChannel

	beforeEach(() => {
		// Reset mocks before each test
		;(vscode.commands.executeCommand as jest.Mock).mockClear()
		;(vscode.window.showInputBox as jest.Mock).mockClear()

		mockPostMessageToWebview = jest.fn()
		mockOutputChannel = {
			appendLine: jest.fn(),
			append: jest.fn(),
			clear: jest.fn(),
			dispose: jest.fn(),
			hide: jest.fn(),
			name: "mockOutputChannel",
			replace: jest.fn(),
			show: jest.fn(),
		} as vscode.OutputChannel

		// Mock context
		const mockContext = {
			extensionPath: "/mock/extension/path",
			globalStorageUri: { fsPath: "/mock/globalStorage" } as vscode.Uri,
			secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
			extension: { packageJSON: { version: "0.0.0" } },
			// ... other context properties as needed
		} as unknown as vscode.ExtensionContext

		controller = new Controller(mockContext, mockOutputChannel, mockPostMessageToWebview as any)
	})

	describe("handleWebviewMessage", () => {
		test('should execute startVoiceChat command when "startVoiceChat" message is received', async () => {
			const message: WebviewMessage = { type: "startVoiceChat" }
			await controller.handleWebviewMessage(message)

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.chat.startVoiceChat")
			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
				"Executing command: workbench.action.chat.startVoiceChat",
			)
		})

		describe('"stopVoiceChat" message', () => {
			const stopVoiceChatMessage: WebviewMessage = { type: "stopVoiceChat" }

			test("should call showInputBox, executeCommand, and post transcribed text", async () => {
				const mockTranscribedText = "Hello world from test"
				;(vscode.window.showInputBox as jest.Mock).mockResolvedValue(mockTranscribedText)

				await controller.handleWebviewMessage(stopVoiceChatMessage)

				expect(vscode.window.showInputBox).toHaveBeenCalled()
				expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.chat.stopListeningAndSubmit")
				expect(mockPostMessageToWebview).toHaveBeenCalledWith({
					type: "transcribedText",
					text: mockTranscribedText,
				})
				expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
					`Transcribed text received: "${mockTranscribedText}"`,
				)
			})

			test("should post empty text if showInputBox resolves undefined", async () => {
				;(vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined)

				await controller.handleWebviewMessage(stopVoiceChatMessage)

				expect(vscode.window.showInputBox).toHaveBeenCalled()
				expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.chat.stopListeningAndSubmit")
				expect(mockPostMessageToWebview).toHaveBeenCalledWith({
					type: "transcribedText",
					text: "",
				})
				expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
					"No text received from input box or text was empty.",
				)
			})

			test("should post empty text if showInputBox resolves with empty string", async () => {
				;(vscode.window.showInputBox as jest.Mock).mockResolvedValue("   ") // Test with whitespace

				await controller.handleWebviewMessage(stopVoiceChatMessage)

				expect(mockPostMessageToWebview).toHaveBeenCalledWith({
					type: "transcribedText",
					text: "",
				})
				expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
					"No text received from input box or text was empty.",
				)
			})

			test("should handle errors gracefully and post error to webview", async () => {
				const errorMessage = "Input box error"
				;(vscode.window.showInputBox as jest.Mock).mockRejectedValue(new Error(errorMessage))

				await controller.handleWebviewMessage(stopVoiceChatMessage)

				expect(vscode.window.showInputBox).toHaveBeenCalled()
				// executeCommand might not be called if showInputBox fails immediately,
				// but the current implementation calls it before awaiting showInputBox.
				expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.chat.stopListeningAndSubmit")

				expect(mockPostMessageToWebview).toHaveBeenCalledWith({
					type: "transcribedText",
					text: "",
					error: `Error: ${errorMessage}`,
				})
				expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
					`Error capturing transcribed text: Error: ${errorMessage}`,
				)
			})
		})
	})
})
