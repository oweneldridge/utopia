import { PersistentModel, EditorTab } from '../../store/editor-state'
import { objectMap } from '../../../../core/shared/object-utils'
import {
  ProjectFile,
  isParseSuccess,
  SceneMetadata,
  TextFile,
  isTextFile,
  textFile,
  textFileContents,
  unparsed,
  RevisionsState,
} from '../../../../core/shared/project-file-types'
import { isRight, right } from '../../../../core/shared/either'
import { convertScenesToUtopiaCanvasComponent } from '../../../../core/model/scene-utils'
import {
  contentsToTree,
  projectContentFile,
  ProjectContentFile,
  ProjectContentsTree,
  transformContentsTree,
} from '../../../assets'

export const CURRENT_PROJECT_VERSION = 6

export function applyMigrations(
  persistentModel: PersistentModel,
): PersistentModel & { projectVersion: typeof CURRENT_PROJECT_VERSION } {
  const version1 = migrateFromVersion0(persistentModel)
  const version2 = migrateFromVersion1(version1)
  const version3 = migrateFromVersion2(version2)
  const version4 = migrateFromVersion3(version3)
  const version5 = migrateFromVersion4(version4)
  const version6 = migrateFromVersion5(version5)
  return version6
}

function migrateFromVersion0(
  persistentModel: PersistentModel,
): PersistentModel & { projectVersion: 1 } {
  if (persistentModel.projectVersion != null && persistentModel.projectVersion !== 0) {
    return persistentModel as any
  } else {
    function updateOpenFilesEntry(openFile: string): EditorTab {
      return {
        type: 'OPEN_FILE_TAB',
        filename: openFile,
      }
    }

    const updatedOpenFiles = persistentModel.openFiles.map((openFile) =>
      updateOpenFilesEntry(openFile as any),
    )
    let updatedSelectedFile: EditorTab | null = null
    const selectedFileAsString: string = persistentModel.selectedFile as any
    if (selectedFileAsString != '') {
      updatedSelectedFile = updateOpenFilesEntry(selectedFileAsString)
    }

    return {
      ...persistentModel,
      openFiles: updatedOpenFiles,
      selectedFile: updatedSelectedFile,
      projectVersion: 1,
    }
  }
}

function migrateFromVersion1(
  persistentModel: PersistentModel,
): PersistentModel & { projectVersion: 2 } {
  if (persistentModel.projectVersion != null && persistentModel.projectVersion !== 1) {
    return persistentModel as any
  } else {
    const updatedFiles = objectMap((file: ProjectFile, fileName) => {
      if (
        isTextFile(file) &&
        isParseSuccess(file.fileContents as any) &&
        isRight((file.fileContents as any).value.canvasMetadata)
      ) {
        const canvasMetadataParseSuccess = (file.fileContents as any).value.canvasMetadata.value
        // this old canvas metadata might store an array of `scenes: Array<SceneMetadata>`, whereas we expect a UtopiaJSXComponent here
        if (
          (canvasMetadataParseSuccess as any).utopiaCanvasJSXComponent == null &&
          (canvasMetadataParseSuccess as any)['scenes'] != null
        ) {
          const scenes = (canvasMetadataParseSuccess as any)['scenes'] as Array<SceneMetadata>
          const utopiaCanvasComponent = convertScenesToUtopiaCanvasComponent(scenes)
          const updatedCanvasMetadataParseSuccess: any = right({
            utopiaCanvasJSXComponent: utopiaCanvasComponent,
          })
          return {
            ...file,
            fileContents: {
              ...file.fileContents,
              value: {
                ...(file.fileContents as any).value,
                canvasMetadata: updatedCanvasMetadataParseSuccess,
              },
            },
          } as TextFile
        } else {
          return file
        }
      } else {
        return file
      }
    }, persistentModel.projectContents as any)
    return {
      ...persistentModel,
      projectContents: updatedFiles as any,
      projectVersion: 2,
    }
  }
}

function migrateFromVersion2(
  persistentModel: PersistentModel,
): PersistentModel & { projectVersion: 3 } {
  if (persistentModel.projectVersion != null && persistentModel.projectVersion !== 2) {
    return persistentModel as any
  } else {
    const updatedFiles = objectMap((file: ProjectFile, fileName) => {
      if (isTextFile(file) && isParseSuccess(file.fileContents as any)) {
        if (
          isRight((file.fileContents as any).value.canvasMetadata) &&
          // the parseSuccess contained a utopiaCanvasJSXComponent which we now merge to the array of topLevelElements
          ((file.fileContents as any).value.canvasMetadata.value as any).utopiaCanvasJSXComponent !=
            null
        ) {
          const utopiaCanvasJSXComponent = ((file.fileContents as any).value.canvasMetadata
            .value as any).utopiaCanvasJSXComponent
          const updatedTopLevelElements = [
            ...(file.fileContents as any).value.topLevelElements,
            utopiaCanvasJSXComponent,
          ]
          return {
            ...file,
            fileContents: {
              ...file.fileContents,
              value: {
                ...(file.fileContents as any).value,
                topLevelElements: updatedTopLevelElements,
                canvasMetadata: right({}),
                projectContainedOldSceneMetadata: true,
              },
            },
          } as TextFile
        } else {
          return {
            ...file,
            fileContents: {
              ...file.fileContents,
              value: {
                ...(file.fileContents as any).value,
                projectContainedOldSceneMetadata: true,
              },
            },
          }
        }
      } else {
        return file
      }
    }, persistentModel.projectContents as any)
    return {
      ...persistentModel,
      projectContents: updatedFiles as any,
      projectVersion: 3,
    }
  }
}

const PackageJsonUrl = '/package.json'

function migrateFromVersion3(
  persistentModel: PersistentModel,
): PersistentModel & { projectVersion: 4 } {
  if (persistentModel.projectVersion != null && persistentModel.projectVersion !== 3) {
    return persistentModel as any
  } else {
    const packageJsonFile = (persistentModel.projectContents as any)[PackageJsonUrl]
    if (packageJsonFile != null && isTextFile(packageJsonFile)) {
      const parsedPackageJson = JSON.parse(packageJsonFile.fileContents as any)
      const updatedPackageJson = {
        ...parsedPackageJson,
        utopia: {
          ...parsedPackageJson.utopia,
          html: `public/${parsedPackageJson.utopia.html}`,
          js: `public/${parsedPackageJson.utopia.js}`,
        },
      }
      const printedPackageJson = JSON.stringify(updatedPackageJson, null, 2)
      const updatedPackageJsonFile = {
        type: 'CODE_FILE',
        fileContents: printedPackageJson,
        lastSavedContents: null,
      }

      return {
        ...persistentModel,
        projectVersion: 4,
        projectContents: {
          ...persistentModel.projectContents,
          [PackageJsonUrl]: updatedPackageJsonFile as any,
        },
      }
    } else {
      console.error('Error migrating project: package.json not found, skipping')
      return { ...persistentModel, projectVersion: 4 }
    }
  }
}

function migrateFromVersion4(
  persistentModel: PersistentModel,
): PersistentModel & { projectVersion: 5 } {
  if (persistentModel.projectVersion != null && persistentModel.projectVersion !== 4) {
    return persistentModel as any
  } else {
    return {
      ...persistentModel,
      projectVersion: 5,
      projectContents: contentsToTree(persistentModel.projectContents as any),
    }
  }
}

function migrateFromVersion5(
  persistentModel: PersistentModel,
): PersistentModel & { projectVersion: 6 } {
  if (persistentModel.projectVersion != null && persistentModel.projectVersion !== 5) {
    return persistentModel as any
  } else {
    return {
      ...persistentModel,
      projectVersion: 6,
      projectContents: transformContentsTree(
        persistentModel.projectContents,
        (tree: ProjectContentsTree) => {
          if (tree.type === 'PROJECT_CONTENT_FILE') {
            const file: ProjectContentFile['content'] = tree.content
            const fileType = file.type as string
            if (fileType === 'CODE_FILE') {
              const newFile = textFile(
                textFileContents((file as any).fileContents, unparsed, RevisionsState.CodeAhead),
                null,
                0,
              )
              return projectContentFile(tree.fullPath, newFile)
            } else if (fileType === 'UI_JS_FILE') {
              const code = (file as any).fileContents.value.code
              const lastRevisedTime = (file as any).lastRevisedTime
              const newFile = textFile(
                textFileContents(code, unparsed, RevisionsState.CodeAhead),
                null,
                lastRevisedTime,
              )
              return projectContentFile(tree.fullPath, newFile)
            } else {
              return tree
            }
          } else {
            return tree
          }
        },
      ),
    }
  }
}
