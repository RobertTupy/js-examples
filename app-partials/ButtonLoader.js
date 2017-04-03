import React, { Component, PropTypes } from 'react'
import Spinner from 'react-loader'
import classnames from 'classnames'
import bootstrap from '../css/bootstrap.css'

class ButtonLoader extends Component {

  getColor() {
    if (this.props.disabled) {
      return this.props.spinColorDisabled
    } else if (this.props.primary || this.props.secondary) {
      return this.props.spinColorLight
    } else {
      return this.props.spinColorDark
    }
  }

  handleClick(ev) {
    if (ev) {
      ev.preventDefault()
    }
    this.props.onClick()
  }

  renderIcon() {
    let icon,
      color = this.getColor()

    if (this.props.loading) {
      icon = <Spinner ref="spinner" {...this.props.spinConfig} color={color} loaded={false}/>
    } else {
      icon = <div color={color}
                        style={{width: 10, height: 10, marginLeft: '8px', verticalAlign: 'center'}}>{this.props.icon}</div>
    }

    return (
            <span style={{
              width: 25,
              height: 25,
              position: 'absolute',
              left: 0,
              top: 1
            }}>
                {icon}
            </span>
        )
  }

  render() {
    let {
            loading,
            } = this.props
    let color = this.getColor()
    let style = Object.assign({}, {
      color,
      paddingLeft: 30,
      position: 'relative',
    }, this.props.style)
    let handleClick = this.handleClick
    if (!(loading)) {
      handleClick = handleClick.bind(this)
    }
    let conditionalClasses = {}
    conditionalClasses[bootstrap['disabled']] = loading
    let cn = classnames(
            bootstrap['btn'],
            bootstrap['btn-default'],
            conditionalClasses
        )
    return (
            <span
                className={cn}
                style={style}
                onClick={handleClick}>
        {this.renderIcon()} {this.props.children}
      </span>
        )
  }
}

ButtonLoader.propTypes = {
  icon: PropTypes.string,
  loading: PropTypes.bool,
  spinConfig: PropTypes.object,
  spinColorDark: PropTypes.string,
  spinColorLight: PropTypes.string,
  spinColorDisabled: PropTypes.string,
  children: PropTypes.node,
  onClick: PropTypes.func.isRequired,
  style: PropTypes.object
}

ButtonLoader.defaultProps = {
  icon: '▸',
  loading: false,
  spinConfig: {
    lines: 10,
    length: 5,
    width: 2,
    radius: 3,
  },
  spinColorDark: '#444',
  spinColorLight: '#444',
  spinColorDisabled: '#999',
  children: <span>Submit</span>,
  style: {}
}


export default ButtonLoader
