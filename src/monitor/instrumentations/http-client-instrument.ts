import { CONFIG } from '../../lib/config';
import { AsyncTargetChannel } from '../channels';
import { NetworkEvent } from '../../lib/events/network-events';
import type { Protocol } from '../../lib/events/network-events';
import url from 'url';
import type { ExtensionInfo } from '../../lib/events/ext-events';
import { Logger } from '../../lib/logger';

// access network channel dynamically to avoid timing issues!
function getNetworkChannel(): AsyncTargetChannel<NetworkEvent> | undefined {
    return (global as any).NETWORK_CH;
}


function blocked(){
    // gracefully block the request
    // .. or maybe not :/
}


function mkCollector(limit:number){
    let buffer = Buffer.alloc(0);
    let trunc = false;
    return {
        push(c:any){
            if(!c||trunc) {
                return;
            }
            const chunk = Buffer.isBuffer(c) ? c : Buffer.from(c);
            const size = buffer.length + chunk.length;
            if(size <= limit){
                buffer = Buffer.concat([buffer,chunk]);
            }
            else {
                const slice = limit - buffer.length;
                if(slice > 0){
                    buffer = Buffer.concat([buffer,chunk.subarray(0,slice)]);
                }
                trunc = true;
            }
        },
        result(){
            return{ data:buffer.toString(), truncated:trunc };
        }
    };
}

// We want a thorough coverage of http client since we're analyzing ALL traffic
// credit: dd-trace-js
function combineOptions(inputURL: any, inputOptions: any) {
    return inputOptions && typeof inputOptions === 'object'
      ? Object.assign(inputURL || {}, inputOptions)
      : inputURL;
}

function normalizeHeaders(options: any) {
    options.headers ??= {};
}

function normalizeCallback(inputOptions: any, callback: any, inputURL: any) {
    return typeof inputOptions === 'function'
      ? [inputOptions, inputURL || {}]
      : [callback, inputOptions];
}

function urlToOptions(u: any, httpExports: any) {
    const agent = u.agent || httpExports.globalAgent;
    const options: any = {
      protocol: u.protocol || agent?.protocol,
      hostname:
        typeof u.hostname === 'string' && u.hostname.startsWith('[')
          ? u.hostname.slice(1, -1)
          : u.hostname || u.host || 'localhost',
      hash: u.hash,
      search: u.search,
      pathname: u.pathname,
      path: `${u.pathname || ''}${u.search || ''}`,
      href: u.href
    };
    if (u.port !== '') {
        options.port = u.port;
    }
    if (u.username || u.password) {
        options.auth = `${u.username}:${u.password}`;
    }
    return options;
  }

function normalizeOptions(inputURL: any, httpExports: any) {
    if (typeof inputURL === 'string') {
      try {
        return urlToOptions(new url.URL(inputURL), httpExports);
      } catch {
        return url.parse(inputURL);
      }
    } else if (inputURL instanceof url.URL) {
      return urlToOptions(inputURL, httpExports);
    } else {
      return inputURL;
    }
}

// Normalize arguments, options and callbacks
export function normalizeArgs(
    httpExports: any,
    inputURL: any,
    inputOptions?: any,
    cb?: any
  ) {
    const originalUrl = inputURL;
    inputURL = normalizeOptions(inputURL, httpExports);
  
    const [callback, inputOptionsNormalized] = normalizeCallback(
      inputOptions,
      cb,
      inputURL
    );
    const options = combineOptions(inputURL, inputOptionsNormalized);
    normalizeHeaders(options);
    const uri = url.format(options);
  
    return { uri, options, callback, originalUrl };
  }

export function patchHttpExports(http:any, protocol:Protocol, extensionInfo: ExtensionInfo){
    Logger.debug(`HTTP Plugin: Starting patch for ${protocol} module, extension: ${extensionInfo.id}`);
    
    if(http.__patched__) {
        Logger.debug(`HTTP Plugin: ${protocol} module already patched, skipping`);
        return;
    }
    
    const orig = http.request.bind(http);
    Logger.debug(`HTTP Plugin: Saved original ${protocol}.request function`);

    http.request=function wrapped(...args:any[]){
        const NETWORK_CH = getNetworkChannel();
        if(!NETWORK_CH) {
            Logger.debug(`HTTP Plugin: Network channel not available, bypassing instrumentation`);
            return orig(...args);
        }

        const parsed = normalizeArgs(http, args[0], args[1], args[2]);
        Logger.debug(`HTTP Plugin: Intercepted ${protocol} request to: ${Logger.truncate(parsed.uri, 100)}`);

        /* pre verdict (still sync/light) */
        const pre=new NetworkEvent(
        protocol, parsed.uri, 'request:pre',__filename,
        extensionInfo,
        undefined,parsed.options
        );
        
        // lightweight domain check in main thread
        // TODO: use network analyzer instead
        if(pre.url.includes('localhost')) { 
            Logger.warn(`HTTP Plugin: Blocking request to blacklisted domain: ${parsed.uri}`);
            return blocked(); 
        }

        const req=orig(...args);

        // collect body then ask worker
        const { push, result } = mkCollector(CONFIG.NETWORK.MAX_CAPTURE_BYTES);
        req.write = new Proxy( req.write, {apply(t, th, [c,...rest]){
            push(c);
            return t.apply(th,[c,...rest]);
        }});
        req.end = new Proxy( req.end, {apply(t,th,[c,...rest]){
            push(c);
            const {data, truncated} = result();
            const post = new NetworkEvent(
                protocol, parsed.uri, 'request:post', __filename, extensionInfo,
                undefined, parsed.options, undefined, undefined, undefined,
                data, truncated
            );
            const networkChannel = getNetworkChannel();
            if (networkChannel) {
                networkChannel.askAsync(post).then(verdict => {
                    if(verdict && !verdict.allowed){
                        req.destroy(new Error('blocked'));
                        // we emit security events from the worker thread instead of the hook
                        // however we're not sure if the blocking was successful due to the TO
                    } else {
                        t.apply(th,[c,...rest]);
                    }
                });
            } else {
                t.apply(th,[c,...rest]);
            }
            return req;
        }});

        req.once('response',(res:any)=>{
        const { push: rp, result: rResult} = mkCollector(CONFIG.NETWORK.MAX_CAPTURE_BYTES);
        res.on('data',rp);
        res.on('end',()=>{
            const {data,truncated}=rResult();
            const ev = new NetworkEvent(
                protocol, parsed.uri, 'response', __filename, extensionInfo,
                undefined, undefined, res.statusCode, res.headers, undefined,
                data, truncated
            );
            const networkChannel = getNetworkChannel();
            if (networkChannel) {
                networkChannel.askAsync(ev).then(v => {
                    if(v && !v.allowed){
                        res.destroy(new Error('blocked'));
                    }
                });
            }
        });
        });
        return req;
    };

    http.get = function(...a:any[]){const r=http.request(...a); r.end(); return r;};
    Object.defineProperty(http,'__patched__',{value:true});
    
    Logger.info(`HTTP Plugin: Successfully patched ${protocol} module for extension ${extensionInfo.id}`);
}