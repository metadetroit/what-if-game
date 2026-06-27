import React from "react"

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-dvh flex items-center justify-center bg-gradient-to-br from-gray-950 to-gray-900 p-6">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-500/15 flex items-center justify-center">
              <span className="text-3xl">😵‍💫</span>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-400 mb-6">
              Fluke hit an unexpected error. Reloading usually fixes it — your game session will be restored.
            </p>
            <button
              onClick={this.handleReload}
              className="btn-primary px-6 py-3 text-base"
            >
              Reload Fluke
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
