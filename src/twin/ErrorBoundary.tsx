import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackRender?: (error: Error) => ReactNode;
  resetKey?: string | number;
  onError?: (error: Error) => void;
};

type State = { error: Error | null };

/** Keeps the chrome up when a CAD load or WebGL path throws. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError?.(error);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return this.props.fallbackRender?.(this.state.error) ?? this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
