/**
 * Unit tests for execution modes service.
 */
import { describe, it, expect } from 'vitest'
import {
  EXECUTION_MODES,
  isValidExecutionMode,
  getExecutionModeFlags,
  isOperationAllowed,
  type ExecutionMode,
} from '../lib/services/execution-modes'

describe('Execution Modes', () => {
  describe('EXECUTION_MODES', () => {
    it('should define exactly three modes', () => {
      const modes = Object.keys(EXECUTION_MODES)
      expect(modes).toHaveLength(3)
      expect(modes).toContain('read-only')
      expect(modes).toContain('edit')
      expect(modes).toContain('side-effect')
    })

    it('should have valid config for each mode', () => {
      for (const [key, config] of Object.entries(EXECUTION_MODES)) {
        expect(config.mode).toBe(key)
        expect(config.label.length).toBeGreaterThan(0)
        expect(config.description.length).toBeGreaterThan(0)
        expect(Array.isArray(config.allowedOperations)).toBe(true)
        expect(Array.isArray(config.blockedOperations)).toBe(true)
        expect(Array.isArray(config.cliFlags)).toBe(true)
        expect(config.cliFlags.length).toBeGreaterThan(0)
      }
    })

    it('read-only mode should block writes and execution', () => {
      const config = EXECUTION_MODES['read-only']
      expect(config.blockedOperations).toContain('write_file')
      expect(config.blockedOperations).toContain('execute_command')
      expect(config.blockedOperations).toContain('http_request')
    })

    it('edit mode should block execution but allow writes', () => {
      const config = EXECUTION_MODES['edit']
      expect(config.allowedOperations).toContain('write_file')
      expect(config.blockedOperations).toContain('execute_command')
      expect(config.blockedOperations).toContain('http_request')
    })

    it('side-effect mode should have no blocked operations', () => {
      const config = EXECUTION_MODES['side-effect']
      expect(config.blockedOperations).toHaveLength(0)
      expect(config.allowedOperations).toContain('execute_command')
      expect(config.allowedOperations).toContain('http_request')
    })
  })

  describe('isValidExecutionMode', () => {
    it('should return true for valid modes', () => {
      expect(isValidExecutionMode('read-only')).toBe(true)
      expect(isValidExecutionMode('edit')).toBe(true)
      expect(isValidExecutionMode('side-effect')).toBe(true)
    })

    it('should return false for invalid modes', () => {
      expect(isValidExecutionMode('invalid')).toBe(false)
      expect(isValidExecutionMode('')).toBe(false)
      expect(isValidExecutionMode('READ-ONLY')).toBe(false)
    })
  })

  describe('getExecutionModeFlags', () => {
    it('should return CLI flags for each mode', () => {
      const readOnlyFlags = getExecutionModeFlags('read-only')
      expect(readOnlyFlags).toContain('--permission-mode')
      expect(readOnlyFlags).toContain('read-only')

      const editFlags = getExecutionModeFlags('edit')
      expect(editFlags).toContain('--permission-mode')
      expect(editFlags).toContain('edit')

      const fullFlags = getExecutionModeFlags('side-effect')
      expect(fullFlags).toContain('--permission-mode')
      expect(fullFlags).toContain('full')
    })

    it('should return empty array for invalid mode', () => {
      const flags = getExecutionModeFlags('invalid' as ExecutionMode)
      expect(flags).toEqual([])
    })
  })

  describe('isOperationAllowed', () => {
    it('should allow read operations in all modes', () => {
      expect(isOperationAllowed('read-only', 'read_file')).toBe(true)
      expect(isOperationAllowed('edit', 'read_file')).toBe(true)
      expect(isOperationAllowed('side-effect', 'read_file')).toBe(true)
    })

    it('should block write_file in read-only mode', () => {
      expect(isOperationAllowed('read-only', 'write_file')).toBe(false)
    })

    it('should allow write_file in edit mode', () => {
      expect(isOperationAllowed('edit', 'write_file')).toBe(true)
    })

    it('should block execute_command in read-only and edit modes', () => {
      expect(isOperationAllowed('read-only', 'execute_command')).toBe(false)
      expect(isOperationAllowed('edit', 'execute_command')).toBe(false)
    })

    it('should allow execute_command in side-effect mode', () => {
      expect(isOperationAllowed('side-effect', 'execute_command')).toBe(true)
    })

    it('should return false for invalid mode', () => {
      expect(isOperationAllowed('invalid' as ExecutionMode, 'read_file')).toBe(false)
    })
  })
})
