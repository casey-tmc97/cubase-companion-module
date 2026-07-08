import { InstanceBase, InstanceStatus, type InstanceTypes, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { MidiConnection } from './midi/connection.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { UpgradeScripts } from './upgrades.js'

// NOTE: this file intentionally deviates from the task-9 brief's sample code.
// The brief assumed an older @companion-module/base API: `class ModuleInstance
// extends InstanceBase<ModuleConfig>` and a top-level `runEntrypoint(ModuleInstance,
// UpgradeScripts)` call. The version actually installed (2.1.1) is quite different:
//
// - `InstanceBase<TManifest extends InstanceTypes>` is now parameterized by a full
//   "manifest" describing config/secrets/actions/feedbacks/variables, not just the
//   config type. `ModuleConfig` alone does not satisfy the `InstanceTypes`
//   constraint, so a `ModuleSchema` type is defined below (following the pattern
//   used by the current companion-module-template-ts).
// - `runEntrypoint` was removed entirely in this version ("remove runEntrypoint
//   method, expect default export instead" — see node_modules/@companion-module/base/
//   CHANGELOG.md, v2.0.0-alpha.0). The module class is now the default export, and
//   `UpgradeScripts` is re-exported by name; Companion's host runtime wires these up
//   itself rather than the module calling a bootstrap function.
// - `init`/`configUpdated` still only need the config parameter (a subclass method
//   may declare fewer parameters than the abstract method it implements), so those
//   signatures are unchanged from the brief.
// - `checkFeedbacks()` now requires at least one explicit feedback-type id argument
//   (`checkFeedbacks(feedbackType, ...feedbackTypes)`); the brief's zero-arg
//   `this.checkFeedbacks()` no longer compiles. The library split this into a
//   separate zero-arg `checkAllFeedbacks()` for exactly this "re-check everything"
//   case (CHANGELOG: "split out checkAllFeedbacks to trigger all feedbacks to be
//   checked"), which is what's used below.
export type ModuleSchema = Omit<InstanceTypes, 'config' | 'secrets'> & {
  config: ModuleConfig
  secrets: undefined
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
  config: ModuleConfig = { inPortName: '', outPortName: '' }
  midi!: MidiConnection

  constructor(internal: unknown) {
    super(internal)
  }

  async init(config: ModuleConfig): Promise<void> {
    this.config = config
    this.updateStatus(InstanceStatus.Connecting)
    this.openMidi()
    this.updateActions()
    this.updateFeedbacks()
    this.updatePresets()
  }

  async configUpdated(config: ModuleConfig): Promise<void> {
    this.config = config
    this.midi?.close()
    this.openMidi()
  }

  async destroy(): Promise<void> {
    this.midi?.close()
  }

  getConfigFields(): SomeCompanionConfigField[] {
    return GetConfigFields()
  }

  updateActions(): void {
    UpdateActions(this)
  }

  updateFeedbacks(): void {
    UpdateFeedbacks(this)
  }

  updatePresets(): void {
    UpdatePresets(this)
  }

  private openMidi(): void {
    this.midi = new MidiConnection(this.config.inPortName, this.config.outPortName)
    this.midi.on('stateChanged', () => {
      this.updateStatus(this.midi.isConnected() ? InstanceStatus.Ok : InstanceStatus.Disconnected)
      this.checkAllFeedbacks()
    })
    this.midi.on('error', (message: string) => {
      this.log('error', message)
      this.updateStatus(InstanceStatus.Disconnected)
    })
    this.midi.open()
  }
}
