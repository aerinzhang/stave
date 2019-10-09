import React, { useRef, useEffect, useState } from 'react';
import style from '../styles/TextArea.module.css';
import {
  ISinglePack,
  AnnotationPosition,
  ISpacedAnnotationSpan,
  ITextNodeDimension,
} from '../lib/interfaces';
import {
  applyColorToLegend,
  calcuateLinesLevels,
  calcuateLinkHeight,
} from '../lib/utils';
import {
  spaceOutText,
  mergeLinkWithPosition,
  mergeAnnotationWithPosition,
} from '../lib/text-spacer';
import Annotation from './Annotation';
import LinkSingleLine from './LinkSingleLine';
import LinkMultiLine from './LinkMultiLine';
import AnnotationLabel from './AnnotationLabel';
import LinkEditConnector from './LinkEditConnector';
import {
  useTextViewerState,
  useTextViewerDispatch,
} from '../contexts/text-viewer.context';
import { throttle } from 'lodash-es';

export interface TextAreaProp {
  textPack: ISinglePack;
}

function TextArea({ textPack }: TextAreaProp) {
  const { annotations, legends, text, links } = textPack;
  const textNodeEl = useRef<HTMLDivElement>(null);
  const textAreaEl = useRef<HTMLDivElement>(null);
  const [annotationPositions, setAnnotationPositions] = useState<
    AnnotationPosition[]
  >([]);

  const [textNodeDimension, setTextNodeDimension] = useState<
    ITextNodeDimension
  >({
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    clientX: 0,
    clientY: 0,
  });

  const annotaionLegendsWithColor = applyColorToLegend(legends.annotations);

  const dispatch = useTextViewerDispatch();
  const {
    selectedLegendIds,
    selectedLegendAttributeIds,

    spacingCalcuated,
    spacedAnnotationSpan,
    spacedText,
    collpasedLineIndexes,

    selectedAnnotationId,
    highlightedAnnotationIds,
    halfSelectedAnnotationIds,

    selectedLinkId,
    highlightedLinkIds,
    halfSelectedLinkIds,

    linkEditFromEntryId,
    linkEditIsCreating,
    linkEditMovePosition,
  } = useTextViewerState();

  useEffect(() => {
    function updatePos(e: MouseEvent) {
      requestAnimationFrame(() => {
        dispatch({
          type: 'update-move-pos',
          pos: { x: e.clientX, y: e.clientY },
        });
      });
    }
    function endMove() {
      dispatch({
        type: 'end-create-link',
      });
    }

    if (linkEditIsCreating) {
      window.addEventListener('mousemove', updatePos);
      window.addEventListener('mouseup', endMove);
    }

    return () => {
      if (linkEditIsCreating) {
        window.removeEventListener('mousemove', updatePos);
        window.removeEventListener('mouseup', endMove);
      }
    };
  }, [linkEditIsCreating, dispatch]);

  useEffect(() => {
    function calculateTextSpace(
      textPack: ISinglePack,
      selectedLegendIds: string[],
      selectedLegendAttributeIds: string[],
      spacingCalcuated: boolean,
      spacedAnnotationSpan: ISpacedAnnotationSpan,
      collpasedLinesIndex: number[]
    ) {
      if (!spacingCalcuated) {
        const { text, annotationSpanMap } = spaceOutText(
          textPack,
          selectedLegendIds,
          selectedLegendAttributeIds,
          collpasedLinesIndex
        );

        dispatch({
          type: 'set-spaced-annotation-span',
          spacedAnnotationSpan: annotationSpanMap,
          spacedText: text,
        });
      }

      if (textNodeEl.current && textAreaEl.current) {
        const textNode = textNodeEl.current && textNodeEl.current.childNodes[0];
        const textAreaRect = textAreaEl.current.getBoundingClientRect();
        const textNodeRect = textNodeEl.current.getBoundingClientRect();

        const textAreaDimension = {
          width: textNodeRect.width,
          height: textNodeRect.height,
          x: textNodeRect.left - textAreaRect.left,
          y: textNodeRect.top - textAreaRect.top,
          clientX: textAreaRect.left,
          clientY: textAreaRect.top,
        };

        const annotationPositions = textPack.annotations.map(anno => {
          const range = document.createRange();

          range.setStart(
            textNode,
            spacedAnnotationSpan[anno.id]
              ? spacedAnnotationSpan[anno.id].begin
              : anno.span.begin
          );
          range.setEnd(
            textNode,
            spacedAnnotationSpan[anno.id]
              ? spacedAnnotationSpan[anno.id].end
              : anno.span.end
          );
          const rects = Array.from(range.getClientRects() as DOMRectList);

          return {
            rects: rects.map(rect => ({
              x: rect.x - textAreaRect.left,
              y: rect.y - textAreaRect.top,
              width: rect.width,
              height: rect.height,
            })),
          };
        });

        setAnnotationPositions(annotationPositions);
        setTextNodeDimension(textAreaDimension);
      }
    }

    const handleWindowResize = throttle(() => {
      dispatch({
        type: 'reset-calculated-text-space',
      });
    }, 100);

    calculateTextSpace(
      textPack,
      selectedLegendIds,
      selectedLegendAttributeIds,
      spacingCalcuated,
      spacedAnnotationSpan,
      collpasedLineIndexes
    );

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [
    textPack,
    selectedLegendIds,
    selectedLegendAttributeIds,
    spacingCalcuated,
    spacedAnnotationSpan,
    dispatch,
    collpasedLineIndexes,
  ]);

  const annotationsWithPosition = mergeAnnotationWithPosition(
    annotationPositions,
    annotations
  ).filter(ann => selectedLegendIds.indexOf(ann.annotation.legendId) > -1);

  const linksWithPos = mergeLinkWithPosition(
    links,
    annotationsWithPosition
  ).filter(link => selectedLegendIds.indexOf(link.link.legendId) > -1);

  const lineStartX = textNodeDimension.x;
  const lineWidth = textNodeDimension.width;
  const linkGap = 8;

  const linesLevels = calcuateLinesLevels(linksWithPos, lineStartX, lineWidth);
  const linkHeight = calcuateLinkHeight(linesLevels, linkGap);
  const lineHeights = Object.keys(linesLevels).map(l => +l);

  const textAreaClass = `${style.text_area_container} ${
    spacedText ? style.text_area_container_visible : ''
  }`;

  return (
    <div
      className={textAreaClass}
      style={{
        userSelect: linkEditIsCreating ? 'none' : 'auto',
      }}
      ref={textAreaEl}
    >
      <div className={style.text_node_container} ref={textNodeEl}>
        {spacedText || text}
      </div>

      <div className={style.annotation_container}>
        {annotationsWithPosition.map((ann, i) => {
          const legend = annotaionLegendsWithColor.find(
            legend => legend.id === ann.annotation.legendId
          );

          if (!legend) {
            return null;
          }
          return (
            <Annotation
              key={i}
              annotation={ann.annotation}
              isSelected={ann.annotation.id === selectedAnnotationId}
              isHighlighted={
                highlightedAnnotationIds.indexOf(ann.annotation.id) > -1 ||
                halfSelectedAnnotationIds.indexOf(ann.annotation.id) > -1
              }
              legend={legend}
              position={ann.position}
            />
          );
        })}
      </div>

      <div className="annotation_line_toggles_container">
        {lineHeights.map((lineHeight, i) => {
          function collapse() {
            dispatch({
              type: 'collapse-line',
              lineIndex: i,
            });
          }
          function uncollapse() {
            dispatch({
              type: 'uncollapse-line',
              lineIndex: i,
            });
          }
          const isCollpased = collpasedLineIndexes.indexOf(i) > -1;

          return (
            <button
              key={i}
              onClick={isCollpased ? uncollapse : collapse}
              className={style.annotation_line_toggle}
              style={{ top: lineHeight }}
            >
              {isCollpased ? '+' : '-'}
            </button>
          );
        })}
      </div>

      <div className="annotation_label_container">
        {annotationsWithPosition.map(ann => {
          const isSelected = ann.annotation.id === selectedAnnotationId;

          return (
            <AnnotationLabel
              key={ann.annotation.id}
              annotationWithPosition={ann}
              isSelected={isSelected}
              selectedLegendAttributeIds={selectedLegendAttributeIds}
            ></AnnotationLabel>
          );
        })}
      </div>

      <div className="links_container">
        {linksWithPos.map(linkPos => {
          const isLinkSelected = selectedLinkId === linkPos.link.id;
          const isLinkHightlighted =
            highlightedLinkIds.includes(linkPos.link.id) ||
            halfSelectedLinkIds.includes(linkPos.link.id);

          if (linkPos.fromLinkY === linkPos.toLinkY) {
            const lineIndex = lineHeights.indexOf(linkPos.fromLinkY);
            const isLineCollapsed =
              collpasedLineIndexes.indexOf(lineIndex) !== -1;

            return (
              <LinkSingleLine
                key={linkPos.link.id}
                linkWithPosition={linkPos}
                isSelected={isLinkSelected}
                isHightlighted={isLinkHightlighted}
                isCollapsed={isLineCollapsed}
                linkHeight={linkHeight}
                selectedLegendAttributeIds={selectedLegendAttributeIds}
              />
            );
          } else {
            return (
              <LinkMultiLine
                key={linkPos.link.id}
                linkWithPosition={linkPos}
                isSelected={isLinkSelected}
                isHightlighted={isLinkHightlighted}
                linkHeight={linkHeight}
                selectedLegendAttributeIds={selectedLegendAttributeIds}
                collpasedLineIndexes={collpasedLineIndexes}
                lineHeights={lineHeights}
                lineStartX={lineStartX}
                lineWidth={lineWidth}
              ></LinkMultiLine>
            );
          }
        })}
      </div>

      <div
        className="link_edit_container"
        style={{
          display: linkEditIsCreating ? 'block' : 'none',
        }}
      >
        <LinkEditConnector
          annotationsWithPosition={annotationsWithPosition}
          fromEntryId={linkEditFromEntryId}
          movePos={linkEditMovePosition}
          textNodeDimension={textNodeDimension}
        />
      </div>
    </div>
  );
}

export default TextArea;
