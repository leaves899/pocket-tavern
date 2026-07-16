// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders a recovery screen after a render error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function BrokenView(): never { throw new Error('render failure') }
    render(<ErrorBoundary><BrokenView /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByText('应用遇到问题')).toBeDefined()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeDefined()
  })
})
