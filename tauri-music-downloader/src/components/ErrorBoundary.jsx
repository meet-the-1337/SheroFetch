import React from 'react'
import { AlertTriangle, RefreshCw, Home, Copy, Check } from 'lucide-react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, copied: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[SheroFetch ErrorBoundary Caught Exception]:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleCopy = () => {
    const text = `SheroFetch UI Error: ${this.state.error?.toString()}\n\nStack:\n${this.state.errorInfo?.componentStack || this.state.error?.stack || ''}`
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#07090E] text-zinc-100 p-6 select-none font-sans">
          <div className="max-w-md w-full bg-zinc-900/90 border border-rose-500/30 rounded-3xl p-6 shadow-2xl backdrop-blur-xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(244,63,94,0.3)]">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">SheroFetch UI Recovered</h2>
              <p className="text-xs text-zinc-400 mt-1">
                An interface exception was prevented from crashing the background engine.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-black/60 border border-white/5 text-left overflow-x-auto max-h-32">
              <p className="text-[11px] font-mono text-rose-300 break-words">
                {this.state.error?.message || this.state.error?.toString() || 'Unknown UI State Error'}
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-[0_0_12px_rgba(0,229,255,0.3)]"
              >
                <Home className="w-4 h-4" />
                <span>Return to App</span>
              </button>

              <button
                onClick={this.handleReload}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload UI</span>
              </button>
            </div>

            <button
              onClick={this.handleCopy}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-1 mx-auto transition"
            >
              {this.state.copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{this.state.copied ? 'Copied error diagnostics' : 'Copy error details'}</span>
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
