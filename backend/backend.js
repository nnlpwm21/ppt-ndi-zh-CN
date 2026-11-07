const path = require('path');
const { app, Menu, Tray, screen, globalShortcut } = require('electron');
const multipleInstance = !app.requestSingleInstanceLock();
const debugLevel = 0; // 0 through 2

let remoteLib = {};
let remoteVar = {};
let lastImageArgs = null;
let loopPaused = false;

// Icons and tray
let iconFile;
let trayIconFile;
let tray = null;
let startAsTray = false;

// Windows variables and data
let isMainWinShown = false;
let isMainWin2shown = false;
let mainWindow = null; // client-mode
let mainWindow2 = null; // client-slideshow or client-classic
let mainWindow3 = null; // client-config
let monitorWin = null; // monitor
let rendererWin = null; // renderer
const winData = {
	mode : {
		"width" : 600,
		"height" : 330,
		"dest" : "client-mode.html"
	},
	slideshow : {
		"width" : 277,
		"height" : 430,
		"dest" : "client-slideshow.html"
	},
	classic : {
		"width" : 960,
		"height" : 700,
		"dest" : "client-classic.html"
	},
	config : {
		"width" : 320,
		"height" : 465,
		"dest" : "client-config.html"
	},
	monitor : {
		"width" : 0,
		"height" : 0,
		"dest" : "monitor.html"
	},
	renderer: {
		"width" : 1024,
		"height" : 768,
		"dest" : "renderer.html"
	}
}

function init() {
	let ret;
	let configPath;
	const configFile = 'config.js';
	const fs = require( 'fs-extra' );

	if ( process.platform === 'win32' ) {
		iconFile = path.join( __dirname, 'img', 'icon.ico' );
		trayIconFile = iconFile;
	} else {
		const nativeImage = require( 'electron' ).nativeImage;
		iconFile = path.join( __dirname, 'img', 'icon.png' );
		trayIconFile = nativeImage.createFromPath( iconFile );
	}

	configPath = configFile;
	if ( !fs.existsSync(configPath) ) {
		let appDataPath;
		switch ( process.platform ) {
			case 'win32':
				appDataPath = process.env.APPDATA;
				break;
			case 'darwin':
				appDataPath = path.join(process.env.HOME, 'Library', 'Preferences');
				break;
			default:
				appDataPath = path.join(process.env.HOME, '.local', 'share');
				break;
		}
		appDataPath = path.join( appDataPath, 'PPT-NDI' );
		configPath = path.join( appDataPath, configFile );
	} else {
		startAsTray = JSON.parse( fs.readFileSync(configPath) ).startAsTray;
	}

	ret = loadArg();
	if ( !ret ) {
		if ( process.platform === 'win32' ) {
			loadMainWin( !startAsTray );
		} else {
			mainWindow2 = createWin({
				width: winData.classic.width,
				height: winData.classic.height,
				maximizable: true,
				winFile: winData.classic.dest,
				showWin: !startAsTray,
				isTransparent: false
			});
			addMainWin2handler( !startAsTray );
			registerFocusInfo( mainWindow2 );
		}
	}

	mainWindow3 = createWin({
		width: winData.config.width,
		height: winData.config.height,
		maximizable: false,
		winFile: winData.config.dest,
		showWin: false,
		isTransparent: false
	});
	mainWindow3.on('close', function (event) {
		event.preventDefault();
		mainWindow3.hide();
	});
	mainWindow3.setAlwaysOnTop(true);

	loadIpc();
	sendLoop();
	refreshTray();
	monitorWin = createWin({
		width: winData.monitor.width,
		height: winData.monitor.height,
		maximizable: false,
		winFile: winData.monitor.dest,
		showWin: (debugLevel === 2 ? true : false),
		isTransparent: true
	});
	rendererWin = createWin({
		width: winData.renderer.width,
		height: winData.renderer.height,
		maximizable: false,
		winFile: winData.renderer.dest,
		showWin: (debugLevel === 2 ? true : false),
		isTransparent: true
	});
	monitorWin.setAlwaysOnTop( true );
	monitorWin.on('close', function (event) {
		event.preventDefault();
		monitorWin.hide();
	});
}

function prepare() {
	app.disableHardwareAcceleration();
	app.allowRendererProcessReuse = true;
	require('@electron/remote/main').initialize();

	app.on('ready', function() {
		init();
	});

	app.on('window-all-closed', (e) => {
		loopPaused = true;
		app.quit();
	});
}

function destroyWin(win) {
	for ( let i = 0; i < win.length; i++ ) {
		if ( win[i] != null && !win[i].isDestroyed() ) {
			win[i].destroy();
		}
	}
}

// 托盘菜单文案（主进程无法使用前端 i18n，故在此按语言内置）
const TRAY_LABELS = {
	en: { hide: '&Hide', show: '&Show', configure: '&Configure', exit: 'E&xit' },
	ko: { hide: '&가리기', show: '&보이기', configure: '&설정', exit: '종료(&X)' },
	zh: { hide: '隐藏(&H)', show: '显示(&S)', configure: '设置(&C)', exit: '退出(&X)' }
};

// 读取配置中的语言设置，用于托盘菜单本地化
function getTrayLabels() {
	const fs = require( 'fs-extra' );
	let lang = 'zh';
	const candidates = [ 'config.js' ];
	const appDataBase = ( process.platform === 'win32' ) ? process.env.APPDATA
		: ( process.platform === 'darwin' ? path.join(process.env.HOME, 'Library', 'Preferences')
			: path.join(process.env.HOME, '.local', 'share') );
	if ( appDataBase ) {
		candidates.push( path.join( appDataBase, 'PPT-NDI', 'config.js' ) );
	}
	for ( let i = 0; i < candidates.length; i++ ) {
		try {
			if ( fs.existsSync(candidates[i]) ) {
				const cfg = JSON.parse( fs.readFileSync(candidates[i]) );
				if ( cfg && cfg.lang ) {
					lang = cfg.lang;
					break;
				}
			}
		} catch(e) {
			// 忽略解析失败，继续使用默认值
		}
	}
	return TRAY_LABELS[lang] || TRAY_LABELS.zh;
}

function refreshTray() {
	let isVisible = true;
	let hideShowItem;
	if ( tray === null ) {
		tray = new Tray(
			process.platform === "win32" ? trayIconFile : trayIconFile.resize({ width: 16, height: 16 })
		);
	}
	if (mainWindow2 != null) {
		isVisible = isMainWin2shown;
	} else if (mainWindow != null) {
		isVisible = isMainWinShown;
	}
	const trayLbl = getTrayLabels();
	hideShowItem = isVisible ? trayLbl.hide : trayLbl.show;
	const contextMenu = Menu.buildFromTemplate([
		{ label: hideShowItem, click() {
			if (mainWindow2 != null) {
				if (isVisible) {
					mainWindow2.hide();
				} else {
					mainWindow2.show();
				}
			} else if (mainWindow != null) {
				if (isVisible) {
					mainWindow.hide();
				} else {
					mainWindow.show();
				}
			}
			refreshTray();
		}},
		{ label: trayLbl.configure, click() {
			mainWindow3.show();
		}},
		{ label: trayLbl.exit, click() {
			loopPaused = true;
			destroyWin([mainWindow2, mainWindow3, monitorWin, rendererWin]);
			if (process.platform != 'darwin') {
				app.quit();
			}
		}}
	]);
	tray.setToolTip('PPT-NDI');
	tray.setContextMenu(contextMenu);
	tray.on('double-click', () => {
		if (mainWindow2 != null) {
			mainWindow2.show();
		} else if (mainWindow != null) {
			mainWindow.show();
		}
		refreshTray();
	});
}

function showHelp() {
	let out = "\nPPT NDI\n";
	out += " " + path.basename(process.argv[0]) + " [--slideshow] [--classic] [--load-file=(path)]\n";
	out += "          [--slideshow] : 幻灯片放映模式\n";
	out += "            [--classic] : 经典模式\n";
	out += "   [--load-file=(path)] : 打开 PowerPoint 文件（配合 --classic 使用）\n";
	console.log(out);
}

function loadArg() {
	const fs = require( 'fs-extra' );
	let matched=false;
	let isClassic = false;
	let fileToLoad = null;
	for (let i = 0, len = process.argv.length; i < len; i++) {
		let val = process.argv[i];
		if (/^(-h|--help|\/\?)/i.test(val)) {
			showHelp();
			process.exit(0);
		} else if (/^--slideshow/i.test(val)) {
			matched=true;
			isClassic = false;
		} else if (/^--classic/i.test(val)) {
			matched=true;
			isClassic = true;
		} else if (/^--load-file=(\S)/i.test(val)) {
			fileToLoad = val.replace(/^--load-file=/i, "");
		} else if (/^--no-sandbox$/.test(val) && process.platform === 'linux') {
			// skip: no-sandbox is part of the atom shell
		} else if (/^(-[^-]|--\S)/.test(val)) {
			console.log("未知参数: " + val);
			showHelp();
			process.exit(1);
		}
	}

	if (matched) {
		if (isClassic) {
			mainWindow2 = createWin({
				width: winData.classic.width,
				height: winData.classic.height,
				maximizable: true,
				winFile: winData.classic.dest,
				showWin: !startAsTray,
				isTransparent: false
			});
			addMainWin2handler(!startAsTray);
			registerFocusInfo(mainWindow2);
			if (fileToLoad) {
				if (!fs.existsSync(fileToLoad)) {
					console.log("文件不存在: " + fileToLoad);
					showHelp();
					process.exit(1);
				}
				mainWindow2.webContents.on('did-finish-load', () => {
					setTimeout(function(){
						mainWindow2.webContents.send('remote', {
							msg: 'loadFile',
							file: fileToLoad
						});
					}, 500);
				});
			}
		} else {
			mainWindow2 = createWin({
				width: winData.slideshow.width,
				height: winData.slideshow.height,
				maximizable: false,
				winFile: winData.slideshow.dest,
				showWin: !startAsTray,
				isTransparent: false
			});
			addMainWin2handler(!startAsTray);
		}
	}

	return matched;
}

function loadMainWin(showWin) {
	mainWindow = createWin({
		width: winData.mode.width,
		height: winData.mode.height,
		maximizable: false,
		winFile: winData.mode.dest,
		showWin: showWin,
		isTransparent: false
	});
	mainWindow.on('closed', function(e) {
		if (mainWindow2 === null) {
			mainWindow = null;
			destroyWin([mainWindow3]);
			if (process.platform != 'darwin') {
				app.quit();
			}
		} else {
			e.preventDefault();
		}
	});
	mainWindow.on('show', () => {
		isMainWinShown = true;
	});
	mainWindow.on('hide', () => {
		isMainWinShown = false;
	});
	if ( showWin ) {
		mainWindow.show();
	}
}

function createWin(winProp) {
	const { BrowserWindow } = require('electron');
	if (debugLevel > 0) {
		winProp.maximizable = true;
	}
	const retData = new BrowserWindow({
		width: winProp.width,
		height: winProp.height,
		minWidth: winProp.width,
		minHeight: winProp.height,
		title: "",
		icon: iconFile,
		frame: false,
		resize: ( winProp.maximizable ? true : false ),
		maximizable: winProp.maximizable,
		webPreferences: {
			webSecurity: false,
			nodeIntegration: true,
			enableRemoteModule: true,
			contextIsolation: false
		},
		transparent : winProp.isTransparent,
		backgroundColor: winProp.isTransparent ? '#00051336' : '#060621'
	});
	
	require("@electron/remote/main").enable(retData.webContents);
	if ( !winProp.maximizable ) {
		retData.setMaximumSize( winProp.width, winProp.height );
	}
	if ( debugLevel > 0 ) {
		retData.webContents.openDevTools();
	}

	retData.loadURL('file://' + __dirname + '/../frontend/' + winProp.winFile);

	if ( !winProp.showWin ) {
		retData.hide();
	} else {
		retData.focus();
	}
	return retData;
}

function addMainWin2handler(showWin) {
	if ( mainWindow2 !== null ) {
		mainWindow2.on('close', function(e) {
			loopPaused = true;
			e.preventDefault();
			mainWindow2.webContents.send('remote', {
				msg: 'exit'
			});
		});
	}
	mainWindow2.on('show', () => {
		isMainWin2shown = true;
	});
	mainWindow2.on('hide', () => {
		isMainWin2shown = false;
	});
	if (showWin) {
		mainWindow2.show();
	}
}

function registerFocusInfo(myWin) {
	if (myWin == null) {
		return;
	}
	myWin.on('focus', () => {
		myWin.webContents.send('remote', { msg: 'focused' });
	});
	myWin.on('blur', () => {
		myWin.webContents.send('remote', { msg: 'blurred' });
	});
}

function sleep(ms){
	return new Promise(resolve=>{
		setTimeout(resolve,ms)
	})
}

async function sendLoop() {
	let sleepCnt = 0;
	while (true) {
		if (
			loopPaused ||
			typeof remoteVar.configData === 'undefined' ||
			!remoteVar.configData.highPerformance
		) {
			await sleep(1000);
			continue;
		}
		if (sleepCnt === 0) {
			sleepCnt = 1000;
		}
		await sleep(sleepCnt);
		if (lastImageArgs !== null) {
			if (lastImageArgs[1] === false) {
				sleepCnt = 100;
				remoteVar.lib.send( ...lastImageArgs );
			}
		} else {
			sleepCnt = 1000;
		}
	}
}

function loadIpc() {
	const ipc = require('electron').ipcMain;

	ipc.on('remote', (event, data) => {
		switch (data.name) {
			case "exit":
				loopPaused = true;
				destroyWin([mainWindow2, mainWindow3, monitorWin, rendererWin]);
				if (process.platform != 'darwin') {
					app.quit();
				}
				break;
			case "select1":
				mainWindow2 = createWin({
					width: winData.slideshow.width,
					height: winData.slideshow.height,
					maximizable: false,
					winFile: winData.slideshow.dest,
					showWin: true,
					isTransparent: false
				});
				addMainWin2handler(true);
				destroyWin([mainWindow]);
				break;
			case "select2":
				mainWindow2 = createWin({
					width: winData.classic.width,
					height: winData.classic.height,
					maximizable: true,
					winFile: winData.classic.dest,
					showWin: true,
					isTransparent: false
				});
				addMainWin2handler(true);
				registerFocusInfo(mainWindow2);
				destroyWin([mainWindow]);
				break;
			case "showConfig":
				mainWindow3.show();
				break;
			case "hideConfig":
				mainWindow3.hide();
				break;
			case "onTop":
				mainWindow2.setAlwaysOnTop(true);
				break;
			case "onTopOff":
				mainWindow2.setAlwaysOnTop(false);
				break;
			case "reflectConfig":
				if (mainWindow != null && !mainWindow.isDestroyed()) {
					mainWindow.webContents.send('remote', { msg: 'reload' });
				}
				if (mainWindow2 !== null && !mainWindow2.isDestroyed()) {
					mainWindow2.webContents.send('remote', { msg: 'reload' });
				}
				globalShortcut_proc();
				break;
			case "passConfigData":
				remoteVar.configData = data.details;
				break;
			default:
				console.log("Unhandled function - loadIpc(): " + data);
				destroyWin([mainWindow]);
				break;
		}
	});

	ipc.on('renderer', (event, data) => {
		switch (data.name) {
			case "notifyError":
			case "notifyLoaded":
			case "notifyCanceled":
				mainWindow2.webContents.send('renderer', data);
				break;
		}

		switch (data.func) {
			case "load":
			case "cancel":
				rendererWin.webContents.send('renderer', data);
				break;
		}
	});

	ipc.on('monitor', (event, data) => {
		switch (data.func) {
			case "update":
				monitorWin.webContents.send('monitor', data);
				break;
			case "get":
				event.returnValue = screen.getAllDisplays();
				/*
				[
				  {
					id: 2528732444,
					bounds: { x: 0, y: 0, width: 1920, height: 1080 },
					workArea: { x: 0, y: 0, width: 1920, height: 1040 },
					accelerometerSupport: 'unknown',
					monochrome: false,
					colorDepth: 24,
					colorSpace: '{primaries:BT709, transfer:IEC61966_2_1, matrix:RGB, range:FULL}',
					depthPerComponent: 8,
					size: { width: 1920, height: 1080 },
					workAreaSize: { width: 1920, height: 1040 },
					scaleFactor: 1,
					rotation: 0,
					internal: false,
					touchSupport: 'unknown'
				  }
				]
				*/
				break;
			case "assign":
				if (data.monitorNo >= 1) {
					let disps = screen.getAllDisplays();
					let disp = disps[data.monitorNo - 1];
					
					if (disp) {
						monitorWin.setBounds({
							x: disp.bounds.x,
							y: disp.bounds.y
						});
						monitorWin.width = disp.bounds.width;
						monitorWin.height = disp.bounds.height;
					}
				}
				break;
			case "turnOn":
				monitorWin.show();
				monitorWin.setFullScreen(true);
				monitorWin.setResizable(false);
				break;
			case "turnOff":
				monitorWin.hide();
				break;
			case "transparentOn":
				monitorWin.setBackgroundColor('#00051336');
				monitorWin.webContents.send('monitor', data);
				break;
			case "transparentOff":
				monitorWin.setBackgroundColor('black');
				monitorWin.webContents.send('monitor', data);
				break;
			case "monitorBlack":
			case "monitorWhite":
			case "monitorTrans":
				monitorWin.webContents.send('monitor', data);
				break;
			default:
				break;
		}
	});

	function globalShortcut_proc() {
		const mainKey = 'Ctrl+Shift+';
		if (typeof remoteVar.configData === 'undefined') return;
		globalShortcut.unregisterAll();

		if ( remoteVar.configData.hotKeys.prev ) {
			globalShortcut.register(mainKey + remoteVar.configData.hotKeys.prev, () => {
				mainWindow2.webContents.send('remote', { msg: 'gotoPrev' });
			});
		}
		if ( remoteVar.configData.hotKeys.next ) {
			globalShortcut.register(mainKey + remoteVar.configData.hotKeys.next, () => {
				mainWindow2.webContents.send('remote', { msg: 'gotoNext' });
			});
		}
		if ( remoteVar.configData.hotKeys.transparent ) {
			globalShortcut.register(mainKey + remoteVar.configData.hotKeys.transparent, () => {
				mainWindow2.webContents.send('remote', { msg: 'update_trn' });
			});
		}
		if ( remoteVar.configData.hotKeys.black ) {
			globalShortcut.register(mainKey + remoteVar.configData.hotKeys.black, () => {
				mainWindow2.webContents.send('remote', { msg: 'update_black' });
			});
		}
		if ( remoteVar.configData.hotKeys.white ) {
			globalShortcut.register(mainKey + remoteVar.configData.hotKeys.white, () => {
				mainWindow2.webContents.send('remote', { msg: 'update_white' });
			});
		}
	}

	ipc.on('status', (event, data) => {
		let ret = null;
		switch (data.item) {
			case "multipleInstance":
				ret = multipleInstance;
				break;
			default:
				break;
		}
		event.returnValue = ret;
	});

	ipc.on('require', (event, data) => {
		/*
			data.lib : string
			data.func : string
			data.on : string
			data.args : array
		*/
		let ret = -1;
		switch (data.lib) {
			case "ffi":
				if (data.func === null && data.args === null) {
					remoteLib.ffi = require("ffi-napi");
					try {
						let libPath = app.getAppPath().replace(/(\\|\/)resources(\\|\/)app\.asar/, "");
						switch (process.platform) {
							case 'win32':
								libPath = path.join( libPath, 'PPTNDI.dll' );
								break;
							case 'darwin':
								libPath = path.join( libPath, 'PPTNDI.dylib' );
								break;
							default:
								libPath = path.join( libPath, 'libpptndi.so' );
								break;
						}

						remoteVar.lib = remoteLib.ffi.Library(
							libPath, {
							'init': [ 'int', [] ],
							'destroy': [ 'int', [] ],
							'send': [ 'int', [ "string", "bool" ] ]
						});
						ret = remoteVar.lib;
					} catch(e) {
						console.log("remoteLib failed: " + e);
					}
				}
				switch (data.func) {
					case "init":
						ret = -1;
						if (typeof remoteVar.lib !== 'undefined') {
							ret = remoteVar.lib.init();
						}
						break;
					case "destroy":
						ret = -1;
						if (typeof remoteVar.lib !== 'undefined') {
							ret = remoteVar.lib.destroy();
						}
						break;
					case "send":
						ret = -1;
						if (typeof remoteVar.lib !== 'undefined') {
							lastImageArgs = data.args;
							ret = remoteVar.lib.send( ...data.args );
						}
						break;
				}
				break;
			case "electron-globalShortcut":
				ret = globalShortcut_proc();
				break;
			default:
				break;
		}
		event.returnValue = (ret < 0 || ret > 0) ? ret : 0;
	});
}

prepare();
