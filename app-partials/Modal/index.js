import React, {Component, PropTypes} from 'react'
import classnames from 'classnames'
import {TYPES} from '../../constants/Modal'
import {closeModal} from '../../actions/modal'
import {requestExportCallback} from '../../actions/news'
import bootstrap from '../../css/bootstrap.css'

class Modal extends Component {
  constructor(props) {
    super(props)
  }

  onClose() {
    this.props.dispatch(closeModal())
  }

  onSubmit() {
    const {
      type,
      dispatch,
      config,
    } = this.props
    const {
      exportData,
      news
    } = config
    const input = this.refs.message
    switch (type) {
      case TYPES.EXPORT_COMMENT:
        if (exportData && news && input) {
          if (input.value && input.value.length > 0) {
            exportData['message'] = input.value
          }
          dispatch(requestExportCallback(exportData, news))
        } else {
          throw Error('Export comment require data')
        }
        break
      default:
        break
    }
    dispatch(closeModal())
  }

  render() {
    const {
      title,
      type,
      show,
    } = this.props
    const styles = show ? {display: 'block'} : {}
    return (
      <div className={bootstrap['modal']} role="dialog" style={styles}>
        <div className={bootstrap['modal-dialog']}>
          <div className={bootstrap['modal-content']}>
            <div className={bootstrap['modal-header']}>
              <button type="button" className={bootstrap['close']} onClick={this.onClose.bind(this)} aria-label="Close">
                <span aria-hidden="true">&times;</span></button>
              <h3 className={bootstrap['modal-title']}>{title}</h3>
            </div>
            <div className={bootstrap['modal-body']}>
              {(() => {
                switch (type) {
                  case TYPES.EXPORT_COMMENT:
                    return (
                      <div>
                        <h4 className={bootstrap['h4']}><label htmlFor="message">Poznámka: <span
                          className={bootstrap['small']}>(nepovinné, max 140 znaků)</span></label></h4>
                        <input name="message" ref="message" maxLength="140" className={bootstrap['form-control']}/>
                      </div>
                    )
                }
              })()}
            </div>
            <div className={bootstrap['modal-footer']}>
              <button type="button" className={ classnames(bootstrap['btn'], bootstrap['btn-default']) }
                      onClick={this.onClose.bind(this)}>Zrušit
              </button>
              <button type="button" className={ classnames(bootstrap['btn'], bootstrap['btn-primary']) }
                      onClick={this.onSubmit.bind(this)}>Převzít
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

Modal.propTypes = {
  dispatch: PropTypes.func.isRequired,
  show: PropTypes.bool,
  type: PropTypes.string,
  title: PropTypes.string,
  config: PropTypes.object
}

Modal.defaultProps = {
  type: TYPES.EXPORT_COMMENT
}

export default Modal