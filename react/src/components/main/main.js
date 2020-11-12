import React from 'react';
import {
  initUsers,
  setMainNavigationPath,
  loginUser,
  initConfig,
  initStaticSystemData,
  initLocalBlacklists,
  initLocalWhitelists
} from '../../actions/actionCreators';
import { refreshSystemIntervals, openTextDialog, closeTextDialog, getAppDataUpdateStatus, makeAppDataChanges } from '../../actions/actionDispatchers'
import mainWindow, { staticVar } from '../../util/mainWindow';
import { POST_AUTH, PRE_AUTH, SELECT_PROFILE, ERROR_SNACK, MID_LENGTH_ALERT, NATIVE, UNLOCK_PROFILE } from '../../util/constants/componentConstants';
import Config from '../../config';
import { connect } from 'react-redux';
import PostAuth from '../postAuth/postAuth'
import PreAuth from '../preAuth/preAuth'
import Modal from '../modals/modal'
import SplashScreen from '../../containers/SplashScreen/SplashScreen'
import SnackbarAlert from '../snackbarAlert/snackbarAlert'
import { newSnackbar, setConfigParams } from '../../actions/actionCreators'
import TextDialog from '../../containers/TextDialog/TextDialog';

class Main extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      initializing: false,
      error: null
    };

    this.preInitialize = this.preInitialize.bind(this);
    this.initialize = this.initialize.bind(this);
  }

  async preInitialize() {
    try {
      const appDataUpdateStatus = await getAppDataUpdateStatus()
  
      if (!appDataUpdateStatus.currentlyCompatible) {
        openTextDialog(
          closeTextDialog,
          [
            {
              title: "Dismiss",
              onClick: async () => {              
                closeTextDialog()
                await this.initialize()
              },
            },
          ],
          `You are running a version of Verus Desktop that may not recognize the file structures in your Verus Desktop data folder. This could lead to unexpected behaviour. To avoid this, quit now, and upgrade to version ${appDataUpdateStatus.latestChange} or later.`,
          "Incompatible Version Detected"
        );
      } else {
        if (appDataUpdateStatus.requiredChanges.length > 0) {
          await makeAppDataChanges(appDataUpdateStatus.requiredChanges)
        }
  
        await this.initialize() 
      }
    } catch(e) {
      throw e
    }
  }

  initialize() {
    const { dispatch } = this.props;

    // Initialize system data intervals and clear any old ones
    refreshSystemIntervals();

    return new Promise(async (resolve, reject) => {
      try {
        const promises = [
          initUsers(),
          initConfig(),
          initStaticSystemData(),
          initLocalWhitelists(),
          initLocalBlacklists(),
        ]
        const actionArray = [
          null,
          null,
          null,
          null,
          null
        ]
  
        for (let i = 0; i < promises.length; i++) {
          actionArray[i] = await promises[i]
        }
  
        const userAction = actionArray[0];
        const configActionArr = actionArray[1];
        const staticSystemDataAction = actionArray[2];
        const whitelistAction = actionArray[3];
        const blacklistAction = actionArray[4];
  
        // Dispatch currency blacklist and whitelist actions to store
        dispatch(whitelistAction);
        dispatch(blacklistAction);
  
        // Dispatch users, config, and system info to store
        dispatch(userAction);
        dispatch(staticSystemDataAction);
        configActionArr.map((configAction) => {
          dispatch(configAction);
        });
  
        const { loadedUsers, config } = this.props;
        const { defaultUserId } = config.general.main;
  
        // Setup initial navigation state
        if (
          defaultUserId &&
          defaultUserId.length > 0 &&
          loadedUsers[defaultUserId]
        ) {
          if (
            Object.values(loadedUsers[defaultUserId].startCoins).every(
              (coinObj) => {
                return coinObj.mode === NATIVE;
              }
            ) ||
            loadedUsers[defaultUserId].pinFile == null
          ) {
            loginUser(loadedUsers[defaultUserId]).map((action) => {
              dispatch(action);
            });
          } else {
            dispatch(setMainNavigationPath(`${PRE_AUTH}/${UNLOCK_PROFILE}`));
          }
        } else if (defaultUserId && defaultUserId.length > 0) {
          try {
            dispatch(
              await setConfigParams(
                config,
                { defaultUserId: "" },
                "general.main"
              )
            );
          } catch (e) {
            dispatch(newSnackbar(ERROR_SNACK, e.message));
            console.error(e);
          }
        } else if (Object.keys(loadedUsers).length > 0) {
          dispatch(setMainNavigationPath(`${PRE_AUTH}/${SELECT_PROFILE}`));
        }
  
        this.setState({ initializing: false }, () => resolve());
      } catch(e) {
        reject(e)
      }
    })
  }

  componentDidUpdate() {
    if (this.state.error != null) throw this.state.error
  }

  async componentDidMount() {
    const appVersion = mainWindow.appBasicInfo;

    this.setState({ initializing: true });

    try {
      await this.preInitialize()
    } catch(e) {
      this.setState({
        error: e
      })
    }
    
    if (appVersion) {
      const _arch = `${
        mainWindow.arch === "x64"
          ? ""
          : mainWindow.arch === "spv-only"
          ? "-spv-only"
          : "-32bit"
      }`;
      const _version = `v${appVersion.version.replace("version=", "")}${_arch}`;

      document.title = `${appVersion.name} (${_version})${appVersion.mode === 'usb' ? " - USB Mode" : ''}`;
    }

    // prevent drag n drop external files
    document.addEventListener("dragover", (event) => event.preventDefault());
    document.addEventListener("drop", (event) => event.preventDefault());

    // apply dark theme
    if (Config.darkmode) {
      document.body.setAttribute("darkmode", true);
    }

    // Function for debugging store
    /*window.printStore = () => {
      console.log(Store.getState());
    };*/
  }

  render() {
    if (staticVar) {
      return (
        <div className="main-container">
          <SnackbarAlert />
          {this.props.textdialog.open && (
            <TextDialog {...this.props.textdialog} />
          )}
          <Modal />
          {this.state.initializing ? (
            <SplashScreen />
          ) : this.props.mainPathArray[0] === POST_AUTH ? (
            <PostAuth />
          ) : (
            <PreAuth />
          )}
        </div>
      );
    } else {
      return null;
    }
  }
}

const mapStateToProps = (state) => {
  return {
    mainPathArray: state.navigation.mainPathArray,
    loadedUsers: state.users.loadedUsers,
    config: state.settings.config,
    textdialog: state.textdialog
  };
};

export default connect(mapStateToProps)(Main);
