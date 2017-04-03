/* eslint-env browser */
import React, {Component, PropTypes} from 'react'
import ReactDOM from 'react-dom'

export default function(InnerComponent) {
  class InfiniteScrollComponent extends Component {
    constructor(props) {
      super(props)
      this.onScroll = this.onScroll.bind(this)
    }

    componentDidMount() {
      window.addEventListener('scroll', this.onScroll, false)
    }

    componentWillUnmount() {
      window.removeEventListener('scroll', this.onScroll, false)
    }

    onScroll() {
      const node = ReactDOM.findDOMNode(this)
      const {
                dispatch,
                onScrollBottomFunc,
                onScrollTopFunc,
                onScrollFunc,
                } = this.props
      if (onScrollTopFunc && node.scrollTop === 0) {
        dispatch(onScrollTopFunc())
      }
      if (onScrollBottomFunc && (node.scrollTop + node.clientHeight >= node.scrollHeight - 20)) {
        dispatch(onScrollBottomFunc())
      }
      if (onScrollFunc) {
        dispatch(onScrollFunc(node.scrollTop))
      }
    }

    render() {
      return <InnerComponent {...this.props} onScroll={this.onScroll} />
    }
    }

  InfiniteScrollComponent.propTypes = {
    dispatch: PropTypes.func.isRequired,
    onScrollBottomFunc: PropTypes.func,
    onScrollTopFunc: PropTypes.func,
    onScrollFunc: PropTypes.func,
  }

  return InfiniteScrollComponent
}
