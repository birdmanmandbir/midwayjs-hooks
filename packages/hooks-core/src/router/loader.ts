import parseFunctionArgs from 'fn-args'
import isFunction from 'lodash/isFunction'
import pickBy from 'lodash/pickBy'
import { run } from '@midwayjs/glob'
import {
  ApiModule,
  EXPORT_DEFAULT_FUNCTION_ALIAS,
  FunctionId,
  HooksMiddleware,
} from '../'
import { IS_DECORATE } from '../const'
import { HttpTrigger } from '../decorate/operator/http'
import { OperatorType } from '../decorate/type'
import { Route } from '../types'
import { FileRouter } from './router'

type LoadConfig = {
  root: string
  source: string
  routes: Route[]
}

type BaseTrigger = {
  type: string
  [key: string]: any
}

type Trigger = BaseTrigger & HTTPTrigger

interface HTTPTrigger extends BaseTrigger {
  type: typeof HttpTrigger
  method:
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'DELETE'
    | 'PATCH'
    | 'HEAD'
    | 'OPTIONS'
    | 'ALL'
  path: string
}

export type AsyncFunction = (...args: any[]) => Promise<any>

export type ApiRoute = {
  fn: AsyncFunction
  trigger: Trigger
  middleware: HooksMiddleware[]
  functionId: FunctionId
  route: Route
}

export function loadApiRoutes(config: LoadConfig): ApiRoute[] {
  const router = new FileRouter(config)

  const files = run(['**/*.{ts,tsx,js,jsx,mjs}'], {
    cwd: router.source,
    ignore: [
      '**/*.test.{ts,tsx,js,jsx,mjs}',
      '**/*.spec.{ts,tsx,js,jsx,mjs}',
      '**/*.d.{ts,tsx}',
      '**/node_modules/**',
    ],
  }).filter((file) => router.isApiFile(file))

  const routes: ApiRoute[] = []
  for (const file of files) {
    const fileRoutes = parseApiRouteFile(require(file), file, router)
    routes.push(...fileRoutes)
  }

  return routes
}

export function parseApiRouteFile(
  mod: ApiModule,
  file: string,
  router: FileRouter
) {
  const apiRoutes: ApiRoute[] = []
  const fileMiddleware = mod?.config?.middleware || []

  const funcs = pickBy(mod, isFunction)

  for (let [name, fn] of Object.entries(funcs)) {
    const exportDefault = name === 'default'
    const functionName = exportDefault ? EXPORT_DEFAULT_FUNCTION_ALIAS : name
    const functionId = router.getFunctionId(file, functionName, exportDefault)

    // default is http trigger
    const trigger: Trigger = Reflect.getMetadata(OperatorType.Trigger, fn) || {
      type: HttpTrigger,
    }

    if (trigger.type === HttpTrigger) {
      // special case for http trigger
      if (!Reflect.getMetadata(IS_DECORATE, fn)) {
        trigger.method = parseFunctionArgs(fn).length > 0 ? 'POST' : 'GET'
      }
      trigger.path = router.fileToHttpPath(file, functionName, exportDefault)
    }

    const fnMiddleware = Reflect.getMetadata(OperatorType.Middleware, fn) || []
    const middleware = fnMiddleware.concat(fileMiddleware)

    apiRoutes.push({
      fn,
      trigger,
      functionId,
      middleware,
      route: router.getRoute(file),
    })
  }

  return apiRoutes
}
