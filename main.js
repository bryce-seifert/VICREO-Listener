/* eslint no-console: 'off' */
const { app, BrowserWindow, Menu, Tray, shell } = require("electron") // app
const osascript = require('node-osascript');
const net = require("net") // TCP server
const robot = require('robotjs') // keyboard and mouse events
const child_process = require('child_process') // Shell and file actions
const path = require('path')
const version = require('./package.json').version
const iconpath = path.join(__dirname, 'img/favicon.png')
const { ipcMain } = require('electron')
let tray = null
let server
let win
let port = 10001; // Standard port

/**
* { "key":"tab", "type":"press", "modifiers":["alt"] }
* { "key":"tab", "type":"processOSX","processName":"Powerpoint" "modifier":["alt"] }
* { "type":"shell","shell":"dir" }
* { "type":"file","path":"C:/Barco/InfoT1413.pdf" }
* { "type":"string","msg":"C:/Barco/InfoT1413.pdf" }
*/

process.on('uncaughtException', (err) => {
	// if (error.code === 'ERR_BUFFER_OUT_OF_BOUNDS' ) {
	//	 // ...
	// } 
	console.error(err)
});

/**
 * Create the main window for the listener
 *
 */
function createWindow() {
	// create window
	win = new BrowserWindow({
		width: 410,
		height: 750,
		resizable: false,
		icon: iconpath,
		webPreferences: {
			nodeIntegration: true
		}
	})

	win.setMenu(null)
	// main process
	// load the index.html of the app
	win.loadFile('screen.html')

	win.on('minimize', function (event) {
		event.preventDefault();
		win.hide();
	});

	win.on('close', function (event) {
		if (!app.isQuiting) {
			event.preventDefault();
			win.hide();
		}

		return false;
	});

	win.on('activate', function () {
		// appIcon.setHighlightMode('always')
		win.show()
	})

	win.on('closed', () => {
		// kill windows or so
		win = null
	})
	createListener()
}

// Catch change port message from front-ed.
ipcMain.on('changePort', (event, arg) => {
	if (arg != port) {
		port = arg;
		console.log(`port number changed to ${port}, closing server`);
		server.close();
		createListener();
	}
})

app.whenReady().then(() => {
	tray = new Tray(path.join(__dirname, 'img/favicon.png'));
	createWindow();

	// create tray menu when ready
	let contextMenu = Menu.buildFromTemplate([
		{
			label: 'Show App', click: function () {
				win.show()
			}
		},
		{
			label: 'Version: ' + version
		},
		{
			label: 'Quit', click: function () {
				app.isQuiting = true;
				server.close()
				console.log('user quit')
				app.quit();
			}
		}
	])
	tray.setContextMenu(contextMenu)

	win.webContents.on('dom-ready', () => {
		// When the DOM is ready we will send the version of the app
		win.webContents.send('version', 'Version: ' + version);
	});

	// When a user click on a link
	win.webContents.on('will-navigate', handleRedirect)
	win.webContents.on('new-window', handleRedirect)
})


/**
 * Handle of a user clicking on a link, this action needs a new window/browser
 *
 * @param {object} e 
 * @param {string} url
 */
let handleRedirect = (e, url) => {
	if (url != win.webContents.getURL()) {
		e.preventDefault()
		shell.openExternal(url)
	}
}

app.on('before_quit', () => {
	// Close server before quiting
	isQuiting = true
	server.close()
	console.log('user quit')
})

app.on('windows-all-closed', () => {
	// On macOS it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform == "darwin") {
		app.quit()
	}
})

app.on('activate', () => {
	// On macOS it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (win === null) {
		createWindow()
	}
})

if (process.platform == "darwin") { app.dock.setIcon(path.join(__dirname, 'img/logo.png')) };

/**
 * Main function for creating the TCP listener
 */
function createListener() {
	// Load socket
	win.webContents.send('log', 'waiting for connection...');

	// Create UDP?
	server = net.createServer((socket) => {
		socket.write('Listener active\r\n');
		socket.pipe(socket);

		console.log("connected")
		win.webContents.send('log', 'connected');
		
		socket.on('end', () => {
			console.log('client ended connection, waiting for connection...')
			win.webContents.send('log', 'client ended connection, waiting for connection...');
		})

		socket.on('connect', () => {
			console.log("connected")
			win.webContents.send('log', 'connected');
		})

		// Try to parse data as JSON, when error returned try old syntax
		socket.on('data', (data) => {
			console.log(data.toString())
			try {
				processIncomingData(JSON.parse(data))
			} catch (e) {
				if(data.toString().charAt(0)=='<') {
					processIncomingData2(data)
				} else {
					console.log(e)
				}
			}
		})

		server.on('error', function (e) {
			callback(true);
		});

		server.on('listening', function (e) {
			server.close();
			callback(false);
		});
	});
	server.listen(port, '0.0.0.0');
};


/**
 * Iterate through array of keys and return keycode for AppleScript
 *
 * @param {string} key to convert
 * @returns {string} code
 */
function findKeyCode(key) {
	for (item of keys) {
		if (key.toLowerCase() == item.key || key == item.vKeyCode) {
			return item.code;
		}
	}
}

/**
 * Walk-through the array and check for old keys
 * @param {array} mod array to check
 * @returns {array} - with correct modifiers
 */
function checkModifiers(mod) {
	if (mod.length) {
		for (item in mod) {
			mod[item] = checkKey(mod[item]);
		}
		return mod
	} else {
		return [];
	}
}

/**
 * Check if old key syntax is used and return the new if needed
 * Also returning lowercase
 * @param {string} - key to check
 * @returns {string} - converted (if needed) String (lowercase)
 */
function checkKey(key) {
	switch (key) {
		case 'cmd':
			return 'command';
		case 'esc':
			return 'escape';
		case 'ctrl':
			return 'control';
		case 'page_up':
			return 'pageup';
		case 'page_down':
			return 'pagedown'
	}
	return key.toLowerCase();
}

/**
 * Formatting the key and modifiers to a AppleScript part
 * @param {string} - key to check
 * @param {array} - array of strings
 * @returns {string} - part of AppleScript with key of key + modifier to press
 */
function processKeyDataOSX(key, modifiers) {
	let script = null;
	// key = key.toLowerCase()
	let modifiersInString = '{'
	for (item of modifiers) {
		if (item == 'cmd') item = 'command';
		if (item == 'ctrl') item = 'control';
		modifiersInString += item + ' down,';
	}
	modifiersInString = modifiersInString.substring(0, modifiersInString.length - 1)
	modifiersInString += '}'

	if (modifiers.length) {
		if (key.length > 1) {
			script = `key code ${findKeyCode(key)} using ${modifiersInString}`;
		} else {
			script = `keystroke \"${key}\" using ${modifiersInString}`;
		}
	} else {
		if (key.length > 1) {
			script = `key code ${findKeyCode(key)}`;
		} else {
			script = `keystroke \"${key}\"`;
		}
	}
	console.log(script)
	return script
}

/**
 * This is the main function for filtering the right actions, use AppleScript for keypress
 * @param {object} - JSON data to process
 */
function processIncomingData(data) {
	win.webContents.send('log', JSON.stringify(data));
	switch (data.type) {
		case 'press':
			if (process.platform == "darwin") {
				osascript.execute('tell application \"System Events\"\n' + processKeyDataOSX(data.key, data.modifiers) + '\nend tell', function (err, result, raw) {
					if (err) return console.error(err)
					console.log(result, raw)
				});
			} else {
				robot.keyTap(checkKey(data.key), checkModifiers(data.modifiers))
			}
			break;

		case 'pressSpecial':
			robot.keyTap(checkKey(data.key), [])
			break;

		case 'down':
			robot.keyToggle(checkKey(data.key), 'down', checkModifiers(data.modifiers))
			break;

		case 'up':
			robot.keyToggle(checkKey(data.key), 'up', checkModifiers(data.modifiers))
			break;

		case 'processOSX':
			let script = null;
			if (data.processName == 'null' || data.processName == '') {
				if (process.platform == "darwin") {
					osascript.execute('tell application \"System Events\"\n' + processKeyDataOSX(data.key, data.modifiers) + '\nend tell', function (err, result, raw) {
						if (err) return console.error(err)
						console.log(result, raw)
					});
				}
			} else {
				if (process.platform == "darwin") {
					console.log(processKeyDataOSX(data.key, data.modifiers))
					osascript.execute(`tell application \"System Events\"\ntell process \"${data.processName}\"\nset frontmost to true\n` + processKeyDataOSX(data.key, data.modifiers) + '\nend tell\nend tell', function (err, result, raw) {
						if (err) return console.error(err)
						console.log(result, raw)
					});
				}
			}

			break;

		case 'shell':
			child_process.exec(data.shell, (error, stdout, stderr) => {
				if (error) {
					win.webContents.send('log', `error: ${error.message}`);
					return;
				}
				if (stderr) {
					win.webContents.send('log', `stderr: ${stderr}`);
					return;
				}
				win.webContents.send('log', `stdout: ${stdout}`);
			})
			break;

		case 'string':
			robot.typeString(data.msg);
			break;

		case 'file':
			if (process.platform == "darwin") {
				child_process.exec('open ' + data.path, function (err, stdout, stderr) {
					if (err) {
						console.error(err);
						return;
					}
					console.log(stdout);
				})
			} else {
				child_process.exec('start ' + data.path, function (err, stdout, stderr) {
					if (err) {
						console.error(err);
						return;
					}
					console.log(stdout);
				})
			}
			break;
	}


}
function processIncomingData2(data) {
	let incomingString = data.toString('utf8')
	win.webContents.send('log', incomingString);
	let key1, key2, key3
	let type = incomingString.slice(1, incomingString.search('>'))
	switch (type) {
		case 'SK':
			key1 = incomingString.slice(incomingString.search('>') + 1)
			hitHotkey(key1, [])
			break;
		case 'SPK':
			key1 = incomingString.slice(incomingString.search('>') + 1)
			hitHotkey(key1, [])
			break;
		case 'KCOMBO':
			key1 = incomingString.slice(8, incomingString.search('<AND>'))
			key2 = incomingString.slice(incomingString.search('<AND>') + 5)
			hitHotkey(key2, [key1])
			break;
		case 'KTRIO':
			key1 = incomingString.slice(7, incomingString.search('<AND>'))
			key2 = incomingString.slice(incomingString.search('<AND>') + 5, incomingString.search('<AND2>'))
			key3 = incomingString.slice(incomingString.search('<AND2>') + 6)
			hitHotkey(key3, [key1, key2])
			break;
		case 'KPRESS':
			key1 = incomingString.slice(8, incomingString.search('<AND>'))
			key2 = incomingString.slice(incomingString.search('<AND>') + 5)
			robot.keyToggle(key2, 'down', key1)
			break;
		case 'KRELEASE':
			key1 = incomingString.slice(8, incomingString.search('<AND>'))
			key2 = incomingString.slice(incomingString.search('<AND>') + 5)
			robot.keyToggle(key2, 'up', key1)
			break;
		case 'MSG':
			robot.typeString(incomingString.slice(incomingString.search('>') + 1))
			break;
		case 'FILE':
			win.webContents.send('log', 'please change to new syntax');
			break;
		case 'SHELL':
			win.webContents.send('log', 'please change to new syntax');
			break;
	}
}

function hitHotkey(key, modifiers) {
	if (process.platform == "darwin") {
		osascript.execute('tell application \"System Events\"\n' + processKeyDataOSX(key, modifiers) + '\nend tell', function (err, result, raw) {
			if (err) return console.error(err)
			console.log(result, raw)
		});
	} else {
		if (modifiers) {
			return robot.keyTap(key, modifiers)
		} else {
			return robot.keyTap(key)
		}
	}
}

const keys = [
	{ key: 'cmd', code: 55, vKeyCode: '0x37' },
	{ key: 'command', code: 55, vKeyCode: '0x37' },
	{ key: 'alt', code: 58, vKeyCode: '0x3A' },
	{ key: 'option', code: 58, vKeyCode: '0x3A' },
	{ key: 'ctrl', code: 59, vKeyCode: '0x3B' },
	{ key: 'control', code: 59, vKeyCode: '0x3B' },
	{ key: 'shift', code: 56, vKeyCode: '0x38' },
	{ key: 'right_shift', code: 60, vKeyCode: '0x3C' },
	{ key: 'right_alt', code: 61, vKeyCode: '0x3D' },
	{ key: 'right_ctrl', code: 62, vKeyCode: '0x3E' },
	{ key: 'fn', code: 63, vKeyCode: '0X3F' },
	{ key: 'f1', code: 122, vKeyCode: '0x7A' },
	{ key: 'f2', code: 120, vKeyCode: '0x78' },
	{ key: 'f3', code: 99, vKeyCode: '0x63' },
	{ key: 'f4', code: 118, vKeyCode: '0x76' },
	{ key: 'f5', code: 96, vKeyCode: '0x60' },
	{ key: 'f6', code: 97, vKeyCode: '0x61' },
	{ key: 'f7', code: 98, vKeyCode: '0x62' },
	{ key: 'f8', code: 99, vKeyCode: '0x64' },
	{ key: 'f9', code: 100, vKeyCode: '0x65' },
	{ key: 'f10', code: 109, vKeyCode: '0x6D' },
	{ key: 'f11', code: 103, vKeyCode: '0x67' },
	{ key: 'f12', code: 111, vKeyCode: '0x6F' },
	{ key: 'f13', code: 105, vKeyCode: '0x69' },
	{ key: 'f14', code: 107, vKeyCode: '0x6B' },
	{ key: 'f15', code: 113, vKeyCode: '0x71' },
	{ key: 'f16', code: 106, vKeyCode: '0x6A' },
	{ key: 'f17', code: 64, vKeyCode: '0x40' },
	{ key: 'f18', code: 79, vKeyCode: '0x4F' },
	{ key: 'f19', code: 80, vKeyCode: '0x50' },
	{ key: 'f20', code: 90, vKeyCode: '0x5A' },
	{ key: 'escape', code: 53, vKeyCode: '0x35' },
	{ key: 'esc', code: 53, vKeyCode: '0x35' },
	{ key: 'enter', code: 36, vKeyCode: '0x24' },
	{ key: 'return', code: 76, vKeyCode: '0x24' },
	{ key: 'space', code: 49, vKeyCode: '0x31' },
	{ key: 'spacebar', code: 49, vKeyCode: '0x31' },
	{ key: 'delete', code: 51, vKeyCode: '0x33' },
	{ key: 'backspace', code: 117 },
	{ key: 'up', code: 126, vKeyCode: '0x7E' },
	{ key: 'down', code: 125, vKeyCode: '0x7D' },
	{ key: 'left', code: 123, vKeyCode: '0x7B' },
	{ key: 'right', code: 124, vKeyCode: '0x7C' },
	{ key: 'home', code: 115, vKeyCode: '0x73' },
	{ key: 'end', code: 119, vKeyCode: '0x77' },
	{ key: 'page_up', code: 116, vKeyCode: '0x74' },
	{ key: 'page_down', code: 121, vKeyCode: '0x79' },
	{ key: 'pageup', code: 116, vKeyCode: '0x74' },
	{ key: 'pagedown', code: 121, vKeyCode: '0x79' },
	{ key: 'Keypad0', code: 82, vKeyCode: '0x52' },
	{ key: 'Keypad1', code: 83, vKeyCode: '0x53' },
	{ key: 'Keypad2', code: 84, vKeyCode: '0x54' },
	{ key: 'Keypad3', code: 85, vKeyCode: '0x55' },
	{ key: 'Keypad4', code: 86, vKeyCode: '0x56' },
	{ key: 'Keypad5', code: 87, vKeyCode: '0x57' },
	{ key: 'Keypad6', code: 88, vKeyCode: '0x58' },
	{ key: 'Keypad7', code: 89, vKeyCode: '0x59' },
	{ key: 'Keypad8', code: 91, vKeyCode: '0x5B' },
	{ key: 'Keypad9', code: 92, vKeyCode: '0x5C' },
	{ key: 'KeypadDecimal', code: 65, vKeyCode: '0x41' },
	{ key: 'KeypadMultiply', code: 67, vKeyCode: '0x43' },
	{ key: 'KeypadPlus', code: 69, vKeyCode: '0x45' },
	{ key: 'KeypadClear', code: 71, vKeyCode: '0x47' },
	{ key: 'KeypadDivide', code: 75, vKeyCode: '0x4B' },
	{ key: 'KeypadEnter', code: 76, vKeyCode: '0x4C' },
	{ key: 'KeypadMinus', code: 78, vKeyCode: '0x4E' },
	{ key: 'KeypadEquals', code: 81, vKeyCode: '0x51' },
	{ key: 'a', code: 0, vKeyCode: '0x00' },
	{ key: 'b', code: 11, vKeyCode: '0x0B' },
	{ key: 'c', code: 8, vKeyCode: '0x08' },
	{ key: 'd', code: 2, vKeyCode: '0x02' },
	{ key: 'e', code: 14, vKeyCode: '0x0E' },
	{ key: 'f', code: 3, vKeyCode: '0x03' },
	{ key: 'g', code: 5, vKeyCode: '0x05' },
	{ key: 'h', code: 4, vKeyCode: '0x04' },
	{ key: 'i', code: 34, vKeyCode: '0x22' },
	{ key: 'j', code: 38, vKeyCode: '0x26' },
	{ key: 'k', code: 40, vKeyCode: '0x28' },
	{ key: 'l', code: 37, vKeyCode: '0x25' },
	{ key: 'm', code: 46, vKeyCode: '0x2E' },
	{ key: 'n', code: 45, vKeyCode: '0x2D' },
	{ key: 'o', code: 31, vKeyCode: '0x1F' },
	{ key: 'p', code: 35, vKeyCode: '0x23' },
	{ key: 'q', code: 12, vKeyCode: '0x0C' },
	{ key: 'r', code: 15, vKeyCode: '0x0F' },
	{ key: 'r', code: 1, vKeyCode: '0x01' },
	{ key: 't', code: 17, vKeyCode: '0x11' },
	{ key: 'u', code: 32, vKeyCode: '0x20' },
	{ key: 'v', code: 9, vKeyCode: '0x09' },
	{ key: 'w', code: 13, vKeyCode: '0x0D' },
	{ key: 'x', code: 7, vKeyCode: '0x07' },
	{ key: 'y', code: 16, vKeyCode: '0x10' },
	{ key: 'z', code: 6, vKeyCode: '0x06' },
	{ key: '0', code: 29, vKeyCode: '0x1D' },
	{ key: '1', code: 18, vKeyCode: '0x12' },
	{ key: '2', code: 19, vKeyCode: '0x13' },
	{ key: '3', code: 20, vKeyCode: '0x14' },
	{ key: '4', code: 21, vKeyCode: '0x15' },
	{ key: '5', code: 23, vKeyCode: '0x17' },
	{ key: '6', code: 22, vKeyCode: '0x16' },
	{ key: '7', code: 26, vKeyCode: '0x1A' },
	{ key: '8', code: 28, vKeyCode: '0x1C' },
	{ key: '9', code: 25, vKeyCode: '0x19' },
]
